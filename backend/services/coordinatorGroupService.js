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
  const current = Array.from(
    new Set((Array.isArray(memberIds) ? memberIds : []).map((memberId) => String(memberId))),
  );
  const normalizedUserId = String(userId);
  const hasStudent = current.includes(normalizedUserId);

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

function buildParticipantSet(group) {
  const participantIds = new Set();

  if (group?.leaderId) {
    participantIds.add(String(group.leaderId));
  }

  (Array.isArray(group?.memberIds) ? group.memberIds : []).forEach((memberId) => {
    participantIds.add(String(memberId));
  });

  return participantIds;
}

async function updateGroupMembershipByCoordinator({ groupId, action, studentId, actor }) {
  assertCoordinatorActor(actor);

  const normalizedAction = normalizeAction(action);
  if (!['ADD', 'REMOVE'].includes(normalizedAction)) {
    throw createServiceError(400, 'INVALID_MEMBERSHIP_ACTION', 'Action must be ADD or REMOVE.');
  }

  const result = await sequelize.transaction(async (transaction) => {
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
      if (String(group.leaderId || '') === String(student.id)) {
        throw createServiceError(400, 'MEMBERSHIP_NO_CHANGE', 'Student already belongs to this group as its leader.');
      }

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

      const participantIds = buildParticipantSet(group);
      participantIds.add(String(student.id));
      if (participantIds.size > Number(group.maxMembers || 0)) {
        throw createServiceError(409, 'GROUP_FULL', 'This group has reached maximum member capacity.');
      }
    }

    const previousMemberIds = Array.isArray(group.memberIds) ? [...group.memberIds] : [];
    const updatedMemberIds = computeMemberUpdate(group.memberIds, normalizedAction, student.id);

    group.memberIds = updatedMemberIds;
    await group.save({ transaction });

    return {
      group,
      auditPayload: {
        actorId: actor.id,
        action: getAuditAction(normalizedAction),
        targetType: 'GROUP',
        targetId: group.id,
        metadata: {
          groupId: group.id,
          targetUserId: student.id,
          studentId,
          membershipAction: normalizedAction,
          previousMemberIds,
          updatedMemberIds,
        },
      },
    };
  });

  AuditLog.create(result.auditPayload).catch((error) => {
    console.error('Coordinator group edit audit write failed.', {
      groupId,
      actorId: actor.id,
      action: normalizedAction,
      studentId,
      error: error.message,
    });
  });

  return result.group;
}

module.exports = {
  updateGroupMembershipByCoordinator,
};

