const { Op } = require('sequelize');
const sequelize = require('../db');
const { Group, AuditLog, Invitation, User } = require('../models');

const GROUP_NAME_MIN_LENGTH = 3;
const GROUP_NAME_MAX_LENGTH = 80;
const NORMALIZED_NAME_FIELD = 'normalizedName';

function createServiceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeGroupName(name) {
  return name.trim().toLowerCase();
}

function validateGroupName(name) {
  if (typeof name !== 'string') {
    throw createServiceError(400, 'INVALID_GROUP_NAME', 'Group name is required.');
  }

  const trimmed = name.trim();
  if (trimmed.length < GROUP_NAME_MIN_LENGTH || trimmed.length > GROUP_NAME_MAX_LENGTH) {
    throw createServiceError(
      400,
      'INVALID_GROUP_NAME',
      `Group name must be between ${GROUP_NAME_MIN_LENGTH} and ${GROUP_NAME_MAX_LENGTH} characters.`,
    );
  }

  return trimmed;
}

async function createShell(name, leaderId) {
  if (!leaderId) {
    throw createServiceError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const sanitizedName = validateGroupName(name);
  const normalizedName = normalizeGroupName(sanitizedName);

  return sequelize.transaction(async (transaction) => {
    const existing = await Group.findOne({
      where: { normalizedName },
      transaction,
    });

    if (existing) {
      throw createServiceError(409, 'DUPLICATE_GROUP_NAME', 'Group name already exists.');
    }

    let group;
    try {
      group = await Group.create(
        {
          name: sanitizedName,
          normalizedName,
          leaderId,
          memberIds: [leaderId],
          advisorId: null,
        },
        { transaction },
      );
    } catch (error) {
      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some((entry) =>
          entry.path === 'name' || entry.path === NORMALIZED_NAME_FIELD
        )
      ) {
        throw createServiceError(409, 'DUPLICATE_GROUP_NAME', 'Group name already exists.');
      }

      if (error.name === 'SequelizeForeignKeyConstraintError') {
        throw createServiceError(400, 'LEADER_NOT_FOUND', 'Leader not found.');
      }

      throw error;
    }

    await AuditLog.create(
      {
        action: 'GROUP_CREATED',
        actorId: leaderId,
        targetId: group.id,
        targetType: 'GROUP',
        metadata: { groupName: sanitizedName },
      },
      { transaction },
    );

    return group;
  });
}

async function dispatchInvitations(groupId, rawStudentIds, caller) {
  const studentIds = [...new Set(rawStudentIds)];

  const group = await Group.findByPk(groupId);
  if (!group) {
    const err = new Error('Group not found');
    err.code = 'GROUP_NOT_FOUND';
    throw err;
  }

  // enforce ownership/role: only the group leader, a coordinator, or an admin
  // may dispatch invitations on behalf of a group.
  const isLeader = group.leaderId === caller.id;
  const isPrivileged = ['COORDINATOR', 'ADMIN'].includes(caller.role);
  if (!isLeader && !isPrivileged) {
    const err = new Error('Not authorized to dispatch invitations for this group');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const users = await User.findAll({
    where: {
      studentId: { [Op.in]: studentIds },
      role: 'STUDENT',
    },
  });

  const foundSet = new Set(users.map((user) => user.studentId));
  const missing = studentIds.filter((sid) => !foundSet.has(sid));
  if (missing.length > 0) {
    const err = new Error('One or more students not found');
    err.code = 'STUDENT_NOT_FOUND';
    err.missing = missing;
    throw err;
  }

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
      }),
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return invitations.map((inv, i) => ({
    id: inv.id,
    groupId: inv.groupId,
    studentId: users[i].studentId,
    status: inv.status,
  }));
}

/**
 * Finalize membership: Add accepted student to group (Data Flow: f11)
 * Enforces constraints, ensures atomicity, and prevents lost updates
 */
async function finalizeMembership(groupId, studentId) {
  const transaction = await sequelize.transaction();

  try {
    // Fetch group with row-level locking to prevent concurrent modifications
    const group = await Group.findByPk(groupId, {
      transaction,
      lock: transaction.LOCK.UPDATE, // Pessimistic locking
    });

    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    // Check if student is already a member
    const currentMembers = group.memberIds || [];
    if (currentMembers.includes(String(studentId))) {
      const error = new Error('Student is already a member of this group');
      error.code = 'DUPLICATE_MEMBER';
      error.status = 400;
      throw error;
    }

    // Add student to memberIds array
    const updatedMembers = [...currentMembers, String(studentId)];

    // Atomically update database
    await group.update(
      {
        memberIds: updatedMembers,
        updatedAt: new Date(),
      },
      { transaction },
    );

    // Commit transaction
    await transaction.commit();

    // Log the membership finalization
    await AuditLog.create({
      action: 'MEMBER_ADDED',
      actorId: group.leaderId,
      targetId: groupId,
      targetType: 'GROUP',
      metadata: { studentId, totalMembers: updatedMembers.length },
    });

    return {
      success: true,
      groupId: group.id,
      studentId: String(studentId),
      totalMembers: updatedMembers.length,
      message: 'Membership finalized successfully',
    };
  } catch (error) {
    // Rollback on any error
    await transaction.rollback();

    // Re-throw with context
    if (error.code && error.status) {
      throw error;
    }

    const serverError = new Error('Failed to finalize membership');
    serverError.code = 'FINALIZE_FAILED';
    serverError.status = 500;
    serverError.originalError = error;
    throw serverError;
  }
}

module.exports = {
  createShell,
  dispatchInvitations,
  finalizeMembership,
};
      serverError.code = 'FINALIZE_FAILED';
      serverError.status = 500;
      serverError.originalError = error;
      throw serverError;
    }
  }

  /**
   * Retrieve group membership details
   */
  async getGroupMembership(groupId) {
    const group = await Group.findByPk(groupId);

    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    return {
      groupId: group.id,
      groupName: group.groupName,
      members: group.members || [],
      status: group.status,
      maxMembers: group.maxMembers,
      currentMemberCount: (group.members || []).length,
      availableSlots: group.maxMembers - (group.members || []).length,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  /**
   * Create a new group
   */
  async createGroup(groupName, maxMembers = 5) {
    try {
      const group = await Group.create({
        groupName: groupName || null,
        maxMembers,
        members: [],
        status: 'FORMATION',
      });

      return {
        groupId: group.id,
        groupName: group.groupName,
        status: group.status,
        maxMembers: group.maxMembers,
        members: group.members,
        createdAt: group.createdAt,
      };
    } catch (error) {
      const serverError = new Error('Failed to create group');
      serverError.code = 'CREATE_GROUP_FAILED';
      serverError.status = 500;
      serverError.originalError = error;
      throw serverError;
    }
  }

  /**
   * Check if student is member of group
   */
  async isStudentMember(groupId, studentId) {
    const group = await Group.findByPk(groupId);

    if (!group) {
      return false;
    }

    return (group.members || []).includes(String(studentId));
  }
}

module.exports = new GroupService();
>>>>>>> e2aa08d (feat: Issue 84 - Finalize Group Membership Write (Data Flow: f11) Backend)
