const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const { IntegrationBinding } = require('../models');
const { ApiError } = require('../middleware/errorResponse');
const {
  hasProvider,
  storeJiraIssues,
} = require('../services/sprintMonitoringPersistenceService');

const ingestJiraIssuesValidation = [
  body('teamId')
    .isString()
    .withMessage('teamId must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('teamId is required'),
  body('sprintId')
    .isString()
    .withMessage('sprintId must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('sprintId is required'),
  body('receivedAt')
    .isISO8601()
    .withMessage('receivedAt must be a valid ISO 8601 datetime'),
  body('issues')
    .isArray({ min: 1 })
    .withMessage('issues must be a non-empty array'),
  body('issues.*')
    .isObject()
    .withMessage('each issue entry must be an object'),
];

async function ingestJiraIssues(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  const teamId = req.body.teamId.trim();
  const sprintId = req.body.sprintId.trim();

  try {
    const binding = await IntegrationBinding.findOne({
      where: { teamId },
    });

    if (!binding) {
      return res.status(404).json({
        code: 'INTEGRATION_BINDING_NOT_FOUND',
        message: 'No integration binding exists for this team',
      });
    }

    if (!hasProvider(binding, 'JIRA')) {
      return res.status(409).json({
        code: 'JIRA_PROVIDER_NOT_ENABLED',
        message: 'This team is not bound to Jira integration',
      });
    }

    const persisted = await storeJiraIssues({
      teamId,
      sprintId,
      issues: req.body.issues,
    });

    return res.status(201).json({
      id: `op_${randomUUID()}`,
      status: 'STORED',
      message: 'Jira issues received successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      receivedCount: persisted.receivedCount,
      storedStoryCount: persisted.storedStoryCount,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    console.error('Error in ingestJiraIssues:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to receive Jira issues',
    });
  }
}

module.exports = {
  ingestJiraIssuesValidation,
  ingestJiraIssues,
};
