const { Op } = require('sequelize');
const sequelize = require('../db');
const Group = require('../models/Group');
const User = require('../models/User');
const invitationsRepository = require('../repositories/invitationsRepository');

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

  async dispatchInvitations(groupId, rawStudentIds) {
    // De-duplicate incoming student IDs
    const studentIds = [...new Set(rawStudentIds)];

    // f2 → validate groupId exists in D2
    const group = await Group.findByPk(groupId);
    if (!group) {
      const err = new Error('Group not found');
      err.code = 'GROUP_NOT_FOUND';
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
    const missing = studentIds.filter((sid) => !foundStudentIds.includes(sid));
    if (missing.length > 0) {
      const err = new Error('One or more students not found');
      err.code = 'STUDENT_NOT_FOUND';
      err.missing = missing;
      throw err;
    }

    // f5 → persist D8 invitations atomically via repository
    const inviteeIds = users.map((u) => u.id);
    const transaction = await sequelize.transaction();
    let invitations;
    try {
      invitations = await invitationsRepository.bulkCreate(groupId, inviteeIds, transaction);
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
