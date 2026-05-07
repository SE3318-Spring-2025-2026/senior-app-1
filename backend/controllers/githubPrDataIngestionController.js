const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const { IntegrationBinding } = require('../models');
const { ApiError } = require('../middleware/errorResponse');
const {
  hasProvider,
  storeGitHubPullRequests,
} = require('../services/sprintMonitoringPersistenceService');

const receiveGitHubPrDataValidation = [
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
    .optional()
    .isISO8601()
    .withMessage('receivedAt must be a valid ISO 8601 datetime'),
  body('pullRequests')
    .isArray({ min: 1 })
    .withMessage('pullRequests must be a non-empty array'),
  body('pullRequests.*')
    .isObject()
    .withMessage('each pull request entry must be an object'),
  body('pullRequests.*.prNumber')
    .optional()
    .isInt({ min: 1 })
    .withMessage('prNumber must be a positive integer'),
  body('pullRequests.*.number')
    .optional()
    .isInt({ min: 1 })
    .withMessage('number must be a positive integer'),
];

async function receiveGitHubPrData(req, res) {
  try {
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
    const receivedAt = req.body.receivedAt || new Date().toISOString();

    const binding = await IntegrationBinding.findOne({
      where: { teamId },
    });

    if (!binding) {
      return res.status(404).json({
        code: 'INTEGRATION_BINDING_NOT_FOUND',
        message: 'No integration binding exists for this team',
      });
    }

    if (!hasProvider(binding, 'GITHUB')) {
      return res.status(409).json({
        code: 'GITHUB_PROVIDER_NOT_ENABLED',
        message: 'This team is not bound to GitHub integration',
      });
    }

    const persisted = await storeGitHubPullRequests({
      teamId,
      sprintId,
      pullRequests: req.body.pullRequests,
    });

    const samplePullRequests = persisted.normalizedPullRequests.slice(0, 3).map((pullRequest) => ({
      prNumber: pullRequest.prNumber,
      issueKey: pullRequest.issueKey,
      branchName: pullRequest.branchName,
      prStatus: pullRequest.prStatus,
      mergeStatus: pullRequest.mergeStatus,
    }));

    console.info('Received GitHub PR ingestion event', {
      teamId,
      sprintId,
      receivedAt,
      pullRequestCount: persisted.receivedCount,
      samplePullRequests,
    });

    return res.status(201).json({
      id: `op_${randomUUID()}`,
      status: 'ACCEPTED',
      message: 'GitHub PR data received successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      receivedCount: persisted.receivedCount,
      storedPullRequestCount: persisted.storedPullRequestCount,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    console.error('GitHub PR ingestion failed unexpectedly', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      code: 'GITHUB_PR_INGESTION_FAILED',
      message: 'Failed to process GitHub PR data.',
    });
  }
}

module.exports = {
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
};
