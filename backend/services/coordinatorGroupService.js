const sequelize = require('../db');
const { Group, AuditLog, User } = require('../models');

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

function computeMemberUpdate(memberIds, action, userId) {
  const current = Array.isArray(memberIds) ? [...memberIds] : [];
  const normalizedUserId = String(userId);
  const hasStudent = current.map((memberId) => String(memberId)).includes(normalizedUserId);

  if (action === 'ADD') {
    if (hasStudent) {
      throw createServiceError(400, 'MEMBERSHIP_NO_CHANGE', 'Student is already a member of this group.');
    }
    return [...current, normalizedUserId];
  }

  if (!hasStudent) {
    throw createServiceError(400, 'MEMBERSHIP_NO_CHANGE', 'Student is not a member of this group.');
  }

  return current.filter((memberId) => String(memberId) !== normalizedUserId);
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
    const student = await User.findOne({
      where: {
        studentId,
        role: 'STUDENT',
      },
      transaction,
    });

    if (!student) {
      throw createServiceError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
    }

    const group = await Group.findByPk(groupId, { transaction });
    if (!group) {
      throw createServiceError(404, 'GROUP_NOT_FOUND', 'Group not found.');
    }

    if (normalizedAction === 'REMOVE' && String(group.leaderId || '') === String(student.id)) {
      throw createServiceError(400, 'LEADER_REMOVE_BLOCKED', 'Coordinator cannot remove group leader via membership edit.');
    }

    if (normalizedAction === 'ADD') {
      const allGroups = await Group.findAll({
        attributes: ['id', 'leaderId', 'memberIds'],
        transaction,
      });

      const alreadyInOtherGroup = allGroups.some((candidate) => {
        if (String(candidate.id) === String(group.id)) {
          return false;
        }

        const isLeader = String(candidate.leaderId || '') === String(student.id);
        const isMember = Array.isArray(candidate.memberIds)
          && candidate.memberIds.map((memberId) => String(memberId)).includes(String(student.id));

        return isLeader || isMember;
      });

      if (alreadyInOtherGroup) {
        throw createServiceError(409, 'STUDENT_ALREADY_IN_OTHER_GROUP', 'Student already belongs to another group.');
      }
    }

    const previousMemberIds = Array.isArray(group.memberIds) ? [...group.memberIds] : [];
    const updatedMemberIds = computeMemberUpdate(group.memberIds, normalizedAction, student.id);

    group.memberIds = updatedMemberIds;
    await group.save({ transaction });

    const auditPayload = {
      actorId: String(actor.id),
      action: getAuditAction(normalizedAction),
      targetId: group.id,
      timestamp: new Date(),
      metadata: {
        groupId: group.id,
        targetUserId: student.id,
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

