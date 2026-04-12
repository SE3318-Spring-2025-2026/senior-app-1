/**
 * controllers/invitationController.js
 */

const GroupService = require('../services/groupService');

/**
 * PATCH /api/v1/invitations/:invitationId/response
 * Payload: { response: "ACCEPT" | "REJECT" }
 */
async function respondToInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;
    const { response } = req.body;

    if (!['ACCEPT', 'REJECT'].includes(response)) {
      return res.status(400).json({
        message: 'Invalid response value. Must be "ACCEPT" or "REJECT".',
      });
    }

    const result = await GroupService.processResponse({
      invitationId,
      callerId: req.user.id,
      response,
    });

    if (result.error === 'NOT_FOUND') {
      return res.status(404).json({ message: 'Invitation not found.' });
    }

    if (result.error === 'FORBIDDEN') {
      return res.status(403).json({
        message: 'You are not authorized to respond to this invitation.',
      });
    }

    if (result.error === 'ALREADY_RESOLVED') {
      return res.status(400).json({
        message: 'Invitation has already been resolved and cannot be updated.',
      });
    }

    return res.status(200).json({ invitation: result.invitation });
  } catch (err) {
    next(err);
  }
}

module.exports = { respondToInvitation };