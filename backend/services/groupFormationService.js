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

  if (actor.role !== 'STUDENT' || !actor.id) {
    throw createServiceError(403, 'STUDENT_AUTH_REQUIRED', 'Active authenticated student account required.');
  }

  const normalizedResponse = normalizeResponse(response);
  if (!['ACCEPT', 'REJECT'].includes(normalizedResponse)) {
    throw createServiceError(400, 'INVALID_INVITATION_RESPONSE', 'Response must be ACCEPT or REJECT.');
  }

  const invitation = await sequelize.transaction(async (transaction) => {
    const invitation = await Invitation.findByPk(invitationId, { transaction });

    if (!invitation) {
      throw createServiceError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    }

    if (invitation.inviteeId !== actor.id) {
      throw createServiceError(403, 'INVITATION_FORBIDDEN', 'This invitation does not belong to the authenticated student.');
    }

    const newStatus = normalizedResponse === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    const [affectedRows] = await Invitation.update(
      { status: newStatus },
      { where: { id: invitationId, inviteeId: actor.id, status: 'PENDING' }, transaction },
    );

    if (affectedRows === 0) {
      throw createServiceError(409, 'INVITATION_ALREADY_RESPONDED', 'Invitation has already been processed.');
    }

    await invitation.reload({ transaction });
    return invitation;
  });

  AuditLog.create({
    action: toAuditAction(normalizedResponse),
    actorId: actor.id,
    targetId: invitation.id,
    targetType: 'INVITATION',
    metadata: { groupId: invitation.groupId },
  }).catch((error) => {
    console.error('Audit log write failed for invitation response.', {
      invitationId,
      actorId: actor.id,
      action: toAuditAction(normalizedResponse),
      error: error.message,
    });
  });

  return invitation;
}

module.exports = {
  processInviteeResponse,
};

