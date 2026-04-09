const sequelize = require('../db');
const { Invitation, AuditLog } = require('../models');

function createServiceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeResponse(response) {
  return String(response || '').trim().toUpperCase();
}

function toAuditAction(response) {
  return response === 'ACCEPT' ? 'INVITE_ACCEPTED' : 'INVITE_REJECTED';
}

async function processInviteeResponse(invitationId, response, actor) {
  if (!actor) {
    throw createServiceError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  if (actor.role !== 'STUDENT' || !actor.studentId) {
    throw createServiceError(403, 'STUDENT_AUTH_REQUIRED', 'Active authenticated student account required.');
  }

  const normalizedResponse = normalizeResponse(response);
  if (!['ACCEPT', 'REJECT'].includes(normalizedResponse)) {
    throw createServiceError(400, 'INVALID_INVITATION_RESPONSE', 'Response must be ACCEPT or REJECT.');
  }

  return sequelize.transaction(async (transaction) => {
    const invitation = await Invitation.findByPk(invitationId, { transaction });

    if (!invitation) {
      throw createServiceError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    }

    if (invitation.studentId !== actor.studentId) {
      throw createServiceError(403, 'INVITATION_FORBIDDEN', 'This invitation does not belong to the authenticated student.');
    }

    if (invitation.status !== 'PENDING') {
      throw createServiceError(400, 'INVITATION_ALREADY_RESPONDED', 'Invitation has already been processed.');
    }

    invitation.status = normalizedResponse === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    await invitation.save({ transaction });

    try {
      await AuditLog.create(
        {
          action: toAuditAction(normalizedResponse),
          actorId: actor.studentId,
          targetId: invitation.id,
          metadata: {
            groupId: invitation.groupId,
          },
        },
        { transaction },
      );
    } catch (error) {
      console.error('Audit log write failed for invitation response.', {
        invitationId,
        actorId: actor.studentId,
        action: toAuditAction(normalizedResponse),
        error: error.message,
      });
      throw createServiceError(500, 'AUDIT_LOG_WRITE_FAILED', 'Audit log write failed for invitation response.');
    }

    return invitation;
  });
}

module.exports = {
  processInviteeResponse,
};

