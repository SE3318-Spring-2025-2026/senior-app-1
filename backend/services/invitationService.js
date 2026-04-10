const Invitation = require('../models/Invitation');

const TERMINAL_STATES = ['ACCEPTED', 'REJECTED'];

async function processResponse(invitationId, newStatus) {
  const invitation = await Invitation.findByPk(invitationId);

  if (!invitation) {
    const error = new Error('Invitation not found');
    error.status = 404;
    throw error;
  }

  if (invitation.status !== 'PENDING') {
    const error = new Error(
      `Cannot transition from ${invitation.status} to ${newStatus}`
    );
    error.status = 400;
    throw error;
  }

  if (!TERMINAL_STATES.includes(newStatus)) {
    const error = new Error(`Invalid status: ${newStatus}`);
    error.status = 400;
    throw error;
  }

  await invitation.update({ status: newStatus });

  return invitation;
}

module.exports = { processResponse };