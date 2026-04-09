const { body, validationResult } = require('express-validator');
const groupFormationService = require('../services/groupFormationService');

const respondToInvitation = [
  body('response').isString().trim().custom((value) => ['ACCEPT', 'REJECT'].includes(String(value).toUpperCase())),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_INVITATION_RESPONSE',
        message: 'Response must be ACCEPT or REJECT.',
      });
    }

    try {
      const invitation = await groupFormationService.processInviteeResponse(
        req.params.invitationId,
        req.body.response,
        req.user,
      );

      return res.status(200).json({
        id: invitation.id,
        groupId: invitation.groupId,
        studentId: invitation.studentId,
        status: invitation.status,
      });
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      return next(error);
    }
  },
];

module.exports = {
  respondToInvitation,
};

