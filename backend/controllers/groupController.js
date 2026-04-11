const { body, param, validationResult } = require('express-validator');
const groupService = require('../services/groupService');

/**
 * Validation error formatter
 */
function buildGroupValidationError(field) {
  switch (field) {
    case 'groupId':
      return { code: 'INVALID_GROUP_ID', message: 'Group ID must be a positive integer.' };
    case 'studentId':
      return { code: 'INVALID_STUDENT_ID', message: 'Student ID must be an 11-digit number.' };
    case 'groupName':
      return { code: 'INVALID_GROUP_NAME', message: 'Group name must be a string.' };
    case 'maxMembers':
      return { code: 'INVALID_MAX_MEMBERS', message: 'Max members must be between 1 and 10.' };
    default:
      return { code: 'INVALID_INPUT', message: 'Invalid input provided.' };
  }
}

function getValidationError(req) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return null;
  }

  return buildGroupValidationError(errors.array()[0].path);
}

/**
 * POST /groups/:groupId/membership/finalize
 * Finalize membership after acceptance
 * Enforces constraints, atomic update, prevents lost updates
 */
const finalizeMembershipValidation = [
  param('groupId').isInt({ min: 1 }).toInt(),
  body('studentId').isString().trim().matches(/^[0-9]{11}$/),
  async (req, res) => {
    const validationError = getValidationError(req);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { groupId } = req.params;
    const { studentId } = req.body;

    try {
      const result = await groupService.finalizeMembership(parseInt(groupId, 10), studentId);

      // NOTE: Leader notification trigger (f12) is deferred to Issue 12 (Notification System)
      // Implementation will use NotificationService once available:
      // const { GroupNotificationService } = require('../services');
      // await GroupNotificationService.notifyLeaderMemberAdded(groupId, studentId);

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Membership finalized successfully',
      });
    } catch (error) {
      if (error.code && error.status) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      console.error('Error finalizing membership:', error);
      return res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to finalize membership',
      });
    }
  },
];

/**
 * GET /groups/:groupId/membership
 * Retrieve group membership details
 */
const getGroupMembershipValidation = [
  param('groupId').isInt({ min: 1 }).toInt(),
  async (req, res) => {
    const validationError = getValidationError(req);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { groupId } = req.params;

    try {
      const membershipData = await groupService.getGroupMembership(parseInt(groupId, 10));

      return res.status(200).json({
        success: true,
        data: membershipData,
      });
    } catch (error) {
      if (error.code && error.status) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      console.error('Error retrieving group membership:', error);
      return res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve group membership',
      });
    }
  },
];

/**
 * POST /groups
 * Create a new group
 */
const createGroupValidation = [
  body('groupName').optional().isString().trim(),
  body('maxMembers').optional().isInt({ min: 1, max: 10 }).toInt(),
  async (req, res) => {
    const validationError = getValidationError(req);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { groupName, maxMembers } = req.body;

    try {
      const result = await groupService.createGroup(groupName, maxMembers);

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Group created successfully',
      });
    } catch (error) {
      if (error.code && error.status) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      console.error('Error creating group:', error);
      return res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create group',
      });
    }
  },
];

module.exports = {
  finalizeMembershipValidation,
  getGroupMembershipValidation,
  createGroupValidation,
};
