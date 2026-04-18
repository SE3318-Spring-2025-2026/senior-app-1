const { body, param, validationResult } = require('express-validator');
const mentorMatchingService = require('../services/mentorMatchingService');

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
  listCoordinatorAdvisors,
  syncUserDatabaseAssignment,
  transferByCoordinator,
  transferInGroupDatabase,
};
