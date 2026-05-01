const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const { normalizePullRequestData } = require('../services/githubPrDataNormalizer');

// Validation rules for batch GitHub PR ingestion endpoint.
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
];

// Accept and process batch GitHub PR data.
// Request body: {teamId, sprintId, receivedAt?, pullRequests: []}
// Returns 201 with operation metadata and normalized PR data.
async function receiveGitHubPrData(req, res) {
  try {
    // Validate request body against validation rules.
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
    const normalizedPullRequests = req.body.pullRequests.map(normalizePullRequestData);

    // Log the ingestion event for audit/monitoring.
    console.info('GitHub PR ingestion event received', {
      teamId,
      sprintId,
      receivedAt,
      pullRequestCount: normalizedPullRequests.length,
    });

    // Return 201 CREATED with operation details and normalized PR data.
    return res.status(201).json({
      id: `op_${randomUUID()}`,
      status: 'ACCEPTED',
      message: 'GitHub PR data received successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      receivedCount: normalizedPullRequests.length,
      pullRequests: normalizedPullRequests,
    });
  } catch (error) {
    // Log unexpected errors for debugging.
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