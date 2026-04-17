const sequelize = require('../db');
const { Group, GroupAdvisorAssignment, Professor, User } = require('../models');

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

async function loadGroupForTransfer(groupId) {
  const group = await Group.findByPk(String(groupId).trim());
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

async function transferAdvisorInGroupDatabase({ groupId, newAdvisorId }) {
  const group = await loadGroupForTransfer(groupId);
  const advisorUserId = normalizeAdvisorUserId(newAdvisorId);
  await findActiveProfessorUser(advisorUserId);
  const currentAdvisorUserId = await ensureGroupHasValidCurrentAdvisor(group);

  if (String(currentAdvisorUserId) === String(advisorUserId)) {
    throw createServiceError(400, 'SAME_ADVISOR_TRANSFER', 'Group is already assigned to this advisor.');
  }

  group.advisorId = String(advisorUserId);
  await group.save();

  return serializeAdvisorAssignment(group);
}

async function syncAdvisorAssignmentsForGroup({ groupId, advisorId }) {
  const group = await loadGroupForTransfer(groupId);
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

  await sequelize.transaction(async (transaction) => {
    await GroupAdvisorAssignment.destroy({
      where: { groupId: group.id },
      transaction,
    });

    await GroupAdvisorAssignment.bulkCreate(rows, { transaction });
  });

  return {
    groupId: group.id,
    advisorId: String(advisorUserId),
    updatedCount: rows.length,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  createServiceError,
  ensureGroupHasValidCurrentAdvisor,
  findActiveProfessorUser,
  serializeAdvisorAssignment,
  syncAdvisorAssignmentsForGroup,
  transferAdvisorInGroupDatabase,
};
