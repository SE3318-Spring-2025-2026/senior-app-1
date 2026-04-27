// Controller for mentor matching operations, including advisor transfers and synchronization
// - POST /api/v1/mentor-matching/groups/:groupId/transfer: Transfer advisor in Group DB
// - POST /api/v1/mentor-matching/groups/:groupId/sync: Sync advisor assignment to User DB
// - POST /api/v1/mentor-matching/groups/:groupId/transfer-by-coordinator: Transfer advisor by coordinator action
// - DELETE /api/v1/mentor-matching/groups/:groupId/advisor: Remove advisor assignment from group
// - DELETE /api/v1/mentor-matching/groups/:groupId/orphan: Delete orphan group without advisor
// - GET /api/v1/mentor-matching/coordinator-advisors: List advisors available for coordinator actions

const { body, param, validationResult } = require('express-validator');
const mentorMatchingService = require('../services/mentorMatchingService');
const GroupService = require('../services/groupService');

const transferInGroupDatabase = [
  param('groupId').isString().trim().notEmpty(),
  body('newAdvisorId').isInt({ min: 1 }).toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_TRANSFER_INPUT',
        message: 'groupId and newAdvisorId are required.',
      });
    }

    try {
      const assignment = await mentorMatchingService.transferAdvisorInGroupDatabase({
        groupId: req.params.groupId,
        newAdvisorId: req.body.newAdvisorId,
      });

      return res.status(200).json(assignment);
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'GROUP_TRANSFER_FAILED',
        message: 'Advisor transfer could not be applied in Group DB.',
      });
    }
  },
];

const syncUserDatabaseAssignment = [
  param('groupId').isString().trim().notEmpty(),
  body('advisorId').isInt({ min: 1 }).toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_ADVISOR_ASSIGNMENT_INPUT',
        message: 'groupId and advisorId are required.',
      });
    }

    try {
      const assignment = await mentorMatchingService.syncAdvisorAssignmentsForGroup({
        groupId: req.params.groupId,
        advisorId: req.body.advisorId,
      });

      return res.status(200).json(assignment);
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'USER_DB_ADVISOR_SYNC_FAILED',
        message: 'Advisor assignment could not be synchronized.',
      });
    }
  },
];

const transferByCoordinator = [
  param('groupId').isString().trim().notEmpty(),
  body('newAdvisorId').isInt({ min: 1 }).toInt(),
  body('reason').optional().isString().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_COORDINATOR_TRANSFER_INPUT',
        message: 'groupId and newAdvisorId are required.',
      });
    }

    try {
      const assignment = await mentorMatchingService.transferAdvisorByCoordinator({
        groupId: req.params.groupId,
        newAdvisorId: req.body.newAdvisorId,
        actorId: req.user.id,
      });

      return res.status(200).json(assignment);
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'COORDINATOR_TRANSFER_FAILED',
        message: 'Advisor transfer could not be completed.',
      });
    }
  },
];

const removeAdvisorAssignment = [
  param('groupId').isString().trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_GROUP_ID',
        message: 'groupId is required.',
      });
    }

    try {
      const result = await mentorMatchingService.removeAdvisorAssignmentFromGroup({
        groupId: req.params.groupId,
      });

      return res.status(200).json(result);
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'GROUP_ADVISOR_REMOVAL_FAILED',
        message: 'Advisor assignment could not be removed from Group DB.',
      });
    }
  },
];

const deleteOrphanGroup = [
  param('groupId').isUUID().withMessage('Group ID must be a valid UUID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    try {
      const result = await GroupService.deleteOrphanGroup(req.params.groupId, req.user);
      return res.status(200).json({
        code: 'SUCCESS',
        message: 'Group deleted successfully',
        data: result,
      });
    } catch (error) {
      if (error.code === 'GROUP_NOT_FOUND') {
        return res.status(404).json({
          code: 'GROUP_NOT_FOUND',
          message: 'Group not found',
        });
      }
      if (error.code === 'GROUP_HAS_ADVISOR') {
        return res.status(403).json({
          code: 'GROUP_HAS_ADVISOR',
          message: 'Group has an assigned advisor and cannot be deleted',
        });
      }
      if (error.code === 'DATA_INTEGRITY_ERROR') {
        return res.status(409).json({
          code: 'DATA_INTEGRITY_ERROR',
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'GROUP_DELETE_FAILED',
        message: 'Group cleanup could not be completed.',
      });
    }
  },
];

const listCoordinatorAdvisors = async (_req, res) => {
  try {
    const advisors = await mentorMatchingService.listActiveAdvisors();
    return res.status(200).json({ data: advisors });
  } catch (_error) {
    return res.status(500).json({
      code: 'ADVISOR_LIST_FAILED',
      message: 'Advisor list could not be loaded.',
    });
  }
};

module.exports = {
  deleteOrphanGroup,
  listCoordinatorAdvisors,
  removeAdvisorAssignment,
  syncUserDatabaseAssignment,
  transferByCoordinator,
  transferInGroupDatabase,
};
