/**
 * controllers/invitationController.js
 */

const GroupService = require('../services/groupService');
const { Invitation, Group } = require('../models');

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

    if (result.error === 'ALREADY_IN_GROUP') {
      return res.status(409).json({
        code: 'ALREADY_IN_GROUP',
        message: 'You already belong to a group and cannot accept another invitation.',
      });
    }

    if (result.error === 'GROUP_FULL') {
      return res.status(409).json({
        code: 'GROUP_FULL',
        message: 'This group has reached maximum member capacity.',
      });
    }

    if (result.error === 'GROUP_CLOSED') {
      return res.status(409).json({
        code: 'GROUP_CLOSED',
        message: 'This group is no longer accepting members.',
      });
    }

    return res.status(200).json({ invitation: result.invitation });
  } catch (err) {
    next(err);
  }
}

async function getMyInvitations(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({ message: 'Student account is required.' });
    }

    const invitations = await Invitation.findAll({
      where: {
        inviteeId: req.user.id,
        status: 'PENDING',
      },
      include: [{ model: Group, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        groupId: invitation.groupId,
        groupName: invitation.Group?.name || 'Unknown Group',
        status: invitation.status,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { respondToInvitation, getMyInvitations };