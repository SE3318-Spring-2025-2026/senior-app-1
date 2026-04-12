const sequelize = require('../db');
const { Group, AuditLog } = require('../models');

function createServiceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeAction(action) {
  return String(action || '').trim().toUpperCase();
}

function assertCoordinatorActor(actor) {
  if (!actor) {
    throw createServiceError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  if (actor.role !== 'COORDINATOR') {
    throw createServiceError(403, 'FORBIDDEN', 'Coordinator role required.');
  }
}

function computeMemberUpdate(memberIds, action, studentId) {
  const current = Array.isArray(memberIds) ? [...memberIds] : [];
  const hasStudent = current.includes(studentId);

  if (action === 'ADD') {
    if (hasStudent) {
      throw createServiceError(400, 'MEMBERSHIP_NO_CHANGE', 'Student is already a member of this group.');
    }
    return [...current, studentId];
  }

  if (!hasStudent) {
    throw createServiceError(400, 'MEMBERSHIP_NO_CHANGE', 'Student is not a member of this group.');
  }

  return current.filter((memberId) => memberId !== studentId);
}

function getAuditAction(action) {
  return action === 'ADD' ? 'COORDINATOR_MEMBER_ADDED' : 'COORDINATOR_MEMBER_REMOVED';
}

async function updateGroupMembershipByCoordinator({ groupId, action, studentId, actor }) {
  assertCoordinatorActor(actor);

  const normalizedAction = normalizeAction(action);
  if (!['ADD', 'REMOVE'].includes(normalizedAction)) {
    throw createServiceError(400, 'INVALID_MEMBERSHIP_ACTION', 'Action must be ADD or REMOVE.');
  }

  return sequelize.transaction(async (transaction) => {
    const group = await Group.findByPk(groupId, { transaction });
    if (!group) {
      throw createServiceError(404, 'GROUP_NOT_FOUND', 'Group not found.');
    }

    const previousMemberIds = Array.isArray(group.memberIds) ? [...group.memberIds] : [];
    const updatedMemberIds = computeMemberUpdate(group.memberIds, normalizedAction, studentId);

    group.memberIds = updatedMemberIds;
    await group.save({ transaction });

    const auditPayload = {
      actorId: String(actor.id),
      action: getAuditAction(normalizedAction),
      targetId: group.id,
      timestamp: new Date(),
      metadata: {
        groupId: group.id,
        studentId,
        membershipAction: normalizedAction,
        previousMemberIds,
        updatedMemberIds,
      },
    };

    try {
      await AuditLog.create(auditPayload, { transaction });
    } catch (error) {
      console.error('Coordinator group edit audit write failed.', {
        groupId,
        actorId: actor.id,
        action: normalizedAction,
        studentId,
        error: error.message,
      });
      throw createServiceError(500, 'AUDIT_LOG_WRITE_FAILED', 'Audit log write failed for coordinator membership update.');
    }

    return group;
  });
}

module.exports = {
  updateGroupMembershipByCoordinator,
};

