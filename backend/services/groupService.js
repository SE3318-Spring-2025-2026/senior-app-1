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

module.exports = {
  createShell,
  dispatchInvitations,
};
