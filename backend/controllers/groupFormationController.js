const { body, validationResult } = require('express-validator');
const groupService = require('../services/groupService');
const groupFormationService = require('../services/groupFormationService');

const buildErrorResponse = (message, errorCode) => ({ message, errorCode });

const handleCreateGroup = [
  body('name').isString().trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_GROUP_NAME',
        message: 'Group name is required.',
      });
    }

    try {
      const group = await groupService.createShell(req.body.name, req.user.id);

      return res.status(201).json({
        id: group.id,
        name: group.name,
        leaderId: group.leaderId,
        memberIds: group.memberIds,
      });
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'GROUP_CREATION_FAILED',
        message: 'Group could not be created.',
      });
    }
  },
];

const handleDispatchInvites = [
  body('studentIds')
    .isArray({ min: 1 })
    .withMessage('studentIds must be a non-empty array'),
  body('studentIds.*')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Each studentId must be a non-empty string'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        buildErrorResponse('Invalid payload', 'VALIDATION_FAILED')
      );
    }

    const { groupId } = req.params;
    const { studentIds } = req.body;

    try {
      const invitations = await groupService.dispatchInvitations(groupId, studentIds, req.user);
      return res.status(201).json(invitations);
    } catch (error) {
      if (error.code === 'GROUP_NOT_FOUND') {
        return res.status(404).json(
          buildErrorResponse('Group not found', 'GROUP_NOT_FOUND')
        );
      }

      if (error.code === 'FORBIDDEN') {
        return res.status(403).json(
          buildErrorResponse('Not authorized to dispatch invitations for this group', 'FORBIDDEN')
        );
      }

      if (error.code === 'STUDENT_NOT_FOUND') {
        return res.status(400).json({
          ...buildErrorResponse('One or more students not found', 'STUDENT_NOT_FOUND'),
          missingStudentIds: error.missing,
        });
      }

      if (error.code === 'DUPLICATE_INVITATION') {
        return res.status(400).json(
          buildErrorResponse(
            'One or more students already have a pending invitation for this group',
            'DUPLICATE_INVITATION'
          )
        );
      }

      return res.status(500).json(
        buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR')
      );
    }
  },
];

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
        inviteeId: invitation.inviteeId,
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
  handleCreateGroup,
  handleDispatchInvites,
  respondToInvitation,
};
