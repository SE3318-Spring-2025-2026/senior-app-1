const { Op } = require('sequelize');
const sequelize = require('../db');
const Group = require('../models/Group');
const Invitation = require('../models/Invitation');
const User = require('../models/User');
const auditLogRepository = require('../repositories/auditLogRepository');

class GroupService {
  async createShell(name, leaderId) {
    const transaction = await sequelize.transaction();

    try {
      const group = await Group.create({
        name: name.trim(),
        leaderId,
        memberIds: [leaderId],
        advisorId: null,
      }, { transaction });

      // D6 audit — written inside the same transaction so it rolls back
      // automatically if the group write fails for any reason.
      await auditLogRepository.create(
        {
          action: 'GROUP_CREATED',
          actorId: leaderId,
          targetId: group.id,
          targetType: 'GROUP',
          metadata: { groupName: group.name },
        },
        transaction
      );

      await transaction.commit();

      return {
        id: group.id,
        name: group.name,
        leaderId: group.leaderId,
        memberIds: group.memberIds,
        advisorId: group.advisorId,
      };
    } catch (error) {
      await transaction.rollback();

      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some((entry) => entry.path === 'name')
      ) {
        const duplicateError = new Error('Group with this name already exists');
        duplicateError.code = 'DUPLICATE_GROUP_NAME';
        throw duplicateError;
      }

      throw error;
    }
  }

  async dispatchInvitations(groupId, rawStudentIds, caller) {
    // De-duplicate incoming student IDs
    const studentIds = [...new Set(rawStudentIds)];

    // f2 → validate groupId exists in D2
    const group = await Group.findByPk(groupId);
    if (!group) {
      const err = new Error('Group not found');
      err.code = 'GROUP_NOT_FOUND';
      throw err;
    }

    // f3 → enforce ownership/role: only the group leader, a coordinator, or an
    // admin may dispatch invitations on behalf of a group.
    const isLeader = group.leaderId === caller.id;
    const isPrivileged = ['COORDINATOR', 'ADMIN'].includes(caller.role);
    if (!isLeader && !isPrivileged) {
      const err = new Error('Not authorized to dispatch invitations for this group');
      err.code = 'FORBIDDEN';
      throw err;
    }

    // f4 → fetch D1 profiles for every requested student ID
    const users = await User.findAll({
      where: {
        studentId: { [Op.in]: studentIds },
        role: 'STUDENT',
      },
    });

    const foundStudentIds = users.map((u) => u.studentId);
    const foundSet = new Set(foundStudentIds);
    const missing = studentIds.filter((sid) => !foundSet.has(sid));
    if (missing.length > 0) {
      const err = new Error('One or more students not found');
      err.code = 'STUDENT_NOT_FOUND';
      err.missing = missing;
      throw err;
    }

    // f5 → persist D8 invitations atomically; findOrCreate ensures idempotency
    // — re-dispatching to an existing invitee returns the existing record
    // instead of crashing on the unique constraint.
    const transaction = await sequelize.transaction();
    let invitations;
    try {
      invitations = await Promise.all(
        users.map(async (user) => {
          const [inv] = await Invitation.findOrCreate({
            where: { groupId, inviteeId: user.id },
            defaults: { status: 'PENDING' },
            transaction,
          });
          return inv;
        })
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // f6 → trigger notifications only after successful persistence
    for (const user of users) {
      console.log(
        `[Notification] Invitation dispatched → studentId: ${user.studentId}, groupId: ${groupId}`
      );
    }

    return invitations.map((inv, i) => ({
      id: inv.id,
      groupId: inv.groupId,
      studentId: users[i].studentId,
      status: inv.status,
    }));
  }
}

module.exports = new GroupService();
