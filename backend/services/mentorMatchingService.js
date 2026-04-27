// Service for handling mentor matching operations, including advisor transfers and synchronization
// - transferAdvisorInGroupDatabase: Transfer advisor in Group DB
// - syncAdvisorAssignmentsForGroup: Sync advisor assignment to User DB
// - transferAdvisorByCoordinator: Transfer advisor by coordinator action
// - removeAdvisorAssignmentFromGroup: Remove advisor assignment from group
// - listActiveAdvisors: List advisors available for coordinator actions


const sequelize = require('../db');
const {
  Group,
  GroupAdvisorAssignment,
  Professor,
  User,
  AuditLog,
} = require('../models');
const NotificationService = require('./notificationService');

function createServiceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeAdvisorUserId(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createServiceError(400, 'INVALID_ADVISOR_ID', 'Advisor ID must be a positive integer.');
  }
  return parsed;
}

async function loadGroupForTransfer(groupId, options = {}) {
  const group = await Group.findByPk(String(groupId).trim(), {
    transaction: options.transaction,
  });
  if (!group) {
    throw createServiceError(404, 'GROUP_NOT_FOUND', 'Group not found.');
  }
  return group;
}

async function findActiveProfessorUser(advisorUserId) {
  const professor = await Professor.findOne({
    where: { userId: advisorUserId },
    include: [
      {
        model: User,
        where: {
          id: advisorUserId,
          role: 'PROFESSOR',
          status: 'ACTIVE',
        },
      },
    ],
  });

  if (!professor || !professor.User) {
    throw createServiceError(404, 'ADVISOR_NOT_FOUND', 'Target advisor was not found.');
  }

  return professor.User;
}

async function ensureGroupHasValidCurrentAdvisor(group) {
  if (!group.advisorId) {
    throw createServiceError(400, 'GROUP_HAS_NO_ADVISOR', 'Group does not currently have an advisor.');
  }

  let currentAdvisorUserId;
  try {
    currentAdvisorUserId = normalizeAdvisorUserId(group.advisorId);
  } catch (_error) {
    throw createServiceError(400, 'GROUP_HAS_INVALID_ADVISOR', 'Group has an invalid current advisor assignment.');
  }

  try {
    await findActiveProfessorUser(currentAdvisorUserId);
  } catch (error) {
    if (error.code === 'ADVISOR_NOT_FOUND') {
      throw createServiceError(400, 'GROUP_HAS_INVALID_ADVISOR', 'Group has an invalid current advisor assignment.');
    }
    throw error;
  }

  return currentAdvisorUserId;
}
function serializeAdvisorAssignment(group) {
  return {
    groupId: group.id,
    advisorId: group.advisorId,
    updatedAt: group.updatedAt,
  };
}

async function transferAdvisorInGroupDatabase({ groupId, newAdvisorId, transaction }) {
  const group = await loadGroupForTransfer(groupId, { transaction });
  const advisorUserId = normalizeAdvisorUserId(newAdvisorId);
  await findActiveProfessorUser(advisorUserId);
  const currentAdvisorUserId = await ensureGroupHasValidCurrentAdvisor(group);

  if (String(currentAdvisorUserId) === String(advisorUserId)) {
    throw createServiceError(400, 'SAME_ADVISOR_TRANSFER', 'Group is already assigned to this advisor.');
  }

  group.advisorId = String(advisorUserId);
  await group.save({ transaction });

  return serializeAdvisorAssignment(group);
}

async function syncAdvisorAssignmentsForGroup({ groupId, advisorId, transaction }) {
  const group = await loadGroupForTransfer(groupId, { transaction });
  const advisorUserId = normalizeAdvisorUserId(advisorId);
  await findActiveProfessorUser(advisorUserId);

  const memberIds = Array.isArray(group.memberIds) ? group.memberIds.map((id) => String(id)) : [];
  const userIds = [...new Set([String(group.leaderId || ''), ...memberIds].filter(Boolean))];

  if (userIds.length === 0) {
    throw createServiceError(400, 'GROUP_HAS_NO_MEMBERS', 'Group has no members to synchronize.');
  }

  const students = await User.findAll({
    where: {
      id: userIds.map((id) => Number(id)),
      role: 'STUDENT',
    },
  });

  if (students.length !== userIds.length) {
    throw createServiceError(400, 'GROUP_MEMBER_RESOLUTION_FAILED', 'One or more group members could not be resolved.');
  }

  const rows = students.map((student) => ({
    groupId: group.id,
    studentUserId: student.id,
    advisorUserId,
  }));

  const applySync = async (activeTransaction) => {
    await GroupAdvisorAssignment.destroy({
      where: { groupId: group.id },
      transaction: activeTransaction,
    });

    await GroupAdvisorAssignment.bulkCreate(rows, { transaction: activeTransaction });
  };

  if (transaction) {
    await applySync(transaction);
  } else {
    await sequelize.transaction(async (managedTransaction) => {
      await applySync(managedTransaction);
    });
  }

  return {
    groupId: group.id,
    advisorId: String(advisorUserId),
    updatedCount: rows.length,
    updatedAt: new Date().toISOString(),
  };
}

async function transferAdvisorByCoordinator({ groupId, newAdvisorId, actorId = null }) {
  const result = await sequelize.transaction(async (transaction) => {
    const group = await loadGroupForTransfer(groupId, { transaction });
    const previousAdvisorId = group.advisorId || null;
    const assignment = await transferAdvisorInGroupDatabase({
      groupId,
      newAdvisorId,
      transaction,
    });
    const syncResult = await syncAdvisorAssignmentsForGroup({
      groupId,
      advisorId: newAdvisorId,
      transaction,
    });

    if (actorId) {
      await AuditLog.create({
        action: 'ADVISOR_TRANSFER',
        actorId,
        targetType: 'GROUP',
        targetId: group.id,
        metadata: {
          groupId: group.id,
          groupName: group.name || null,
          previousAdvisorId,
          newAdvisorId: assignment.advisorId,
        },
      }, { transaction });
    }

    return {
      groupId: assignment.groupId,
      advisorId: assignment.advisorId,
      leaderId: group.leaderId || null,
      groupName: group.name || null,
      updatedAt: assignment.updatedAt,
      updatedCount: syncResult.updatedCount,
    };
  });

  const advisorUser = await findActiveProfessorUser(newAdvisorId);

  await Promise.all([
    NotificationService.notifyAdvisorTransferredGroup({
      advisorId: advisorUser.id,
      groupId: result.groupId,
      groupName: result.groupName,
      message: result.groupName
        ? `${result.groupName} has been assigned to you through transfer.`
        : 'A new group has been assigned to you through transfer.',
    }),
    result.leaderId
      ? NotificationService.notifyTeamLeaderAdvisorTransferred({
        leaderId: Number.parseInt(String(result.leaderId), 10),
        groupId: result.groupId,
        groupName: result.groupName,
        newAdvisorId: advisorUser.id,
        newAdvisorName: advisorUser.fullName,
        newAdvisorEmail: advisorUser.email,
        message: result.groupName
          ? `${result.groupName} has been transferred to advisor ${advisorUser.fullName}.`
          : 'Your group advisor has been changed through a transfer.',
      })
      : Promise.resolve(),
  ]);

  return {
    groupId: result.groupId,
    advisorId: result.advisorId,
    updatedAt: result.updatedAt,
    updatedCount: result.updatedCount,
  };
}

async function removeAdvisorAssignmentFromGroup({ groupId, actorId = null }) {
  const result = await sequelize.transaction(async (transaction) => {
    const group = await loadGroupForTransfer(groupId, { transaction });

    const removedAssignmentCount = await GroupAdvisorAssignment.destroy({
      where: { groupId: group.id },
      transaction,
    });

    if (!group.advisorId && removedAssignmentCount === 0) {
      throw createServiceError(400, 'GROUP_HAS_NO_ADVISOR', 'Group does not currently have an advisor assignment.');
    }

    const previousAdvisorId = group.advisorId;
    group.advisorId = null;
    group.status = 'LOOKING_FOR_ADVISOR';
    await group.save({ transaction });

    if (actorId) {
      await AuditLog.create({
        action: 'ADVISOR_RELEASE',
        actorId,
        targetType: 'GROUP',
        targetId: group.id,
        metadata: {
          groupId: group.id,
          groupName: group.name || null,
          previousAdvisorId: previousAdvisorId || null,
        },
      }, { transaction });
    }

    return {
      groupId: group.id,
      leaderId: group.leaderId || null,
      groupName: group.name || null,
      advisorId: group.advisorId,
      previousAdvisorId: previousAdvisorId || null,
      removed: true,
      removedAssignmentCount,
      updatedAt: group.updatedAt,
    };
  });

  const normalizedPreviousAdvisorId = Number.parseInt(String(result.previousAdvisorId || ''), 10);
  const previousAdvisorUser = Number.isInteger(normalizedPreviousAdvisorId) && normalizedPreviousAdvisorId > 0
    ? await User.findByPk(normalizedPreviousAdvisorId, {
      attributes: ['id', 'fullName', 'email'],
    })
    : null;

  if (result.leaderId) {
    await NotificationService.notifyTeamLeaderAdvisorReleased({
      leaderId: Number.parseInt(String(result.leaderId), 10),
      groupId: result.groupId,
      groupName: result.groupName,
      previousAdvisorId: previousAdvisorUser?.id ?? result.previousAdvisorId,
      previousAdvisorName: previousAdvisorUser?.fullName ?? null,
      previousAdvisorEmail: previousAdvisorUser?.email ?? null,
      message: result.groupName
        ? `${result.groupName} is no longer assigned to advisor ${previousAdvisorUser?.fullName || 'the previous advisor'}.`
        : 'Your group advisor has been released from the group.',
    });
  }

  return {
    groupId: result.groupId,
    advisorId: result.advisorId,
    previousAdvisorId: result.previousAdvisorId,
    removed: result.removed,
    removedAssignmentCount: result.removedAssignmentCount,
    updatedAt: result.updatedAt,
  };
}

async function listActiveAdvisors() {
  const professors = await Professor.findAll({
    include: [
      {
        model: User,
        where: {
          role: 'PROFESSOR',
          status: 'ACTIVE',
        },
        attributes: ['id', 'fullName', 'email'],
      },
    ],
    order: [['fullName', 'ASC']],
  });

  return professors
    .filter((professor) => professor.User)
    .map((professor) => ({
      id: professor.User.id,
      fullName: professor.fullName || professor.User.fullName,
      email: professor.User.email,
      department: professor.department || null,
    }));
}

module.exports = {
  createServiceError,
  ensureGroupHasValidCurrentAdvisor,
  findActiveProfessorUser,
  listActiveAdvisors,
  removeAdvisorAssignmentFromGroup,
  serializeAdvisorAssignment,
  syncAdvisorAssignmentsForGroup,
  transferAdvisorByCoordinator,
  transferAdvisorInGroupDatabase,
};
