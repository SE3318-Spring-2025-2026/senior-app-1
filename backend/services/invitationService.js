const { Invitation } = require('../models');
const GroupService = require('./groupService');

const VALID_TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED'],
};

const processResponse = async (invitationId, newStatus) => {
  // 1. Fetch invitation
  const invitation = await Invitation.findByPk(invitationId);
  if (!invitation) {
    const err = new Error('Invitation not found');
    err.status = 404;
    throw err;
  }

  // 2. Validate transition
  const allowed = VALID_TRANSITIONS[invitation.status] ?? [];
  if (!allowed.includes(newStatus)) {
    const err = new Error(
      `Invalid transition: ${invitation.status} → ${newStatus}`
    );
    err.status = 400;
    throw err;
  }

  // 3. Update status
  invitation.status = newStatus;
  await invitation.save();

  // 4. Trigger membership finalization ONLY on ACCEPT (idempotent guard included)
  if (newStatus === 'ACCEPTED') {
    await GroupService.finalizeMembership(
      invitation.groupId,
      invitation.studentId
    );
  }

  return invitation;
};

module.exports = { processResponse };