const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const sequelize = require('../db');
const { IntegrationBinding, SprintPullRequest } = require('../models');
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
  body('pullRequests.*.prNumber')
    .optional()
    .isInt({ min: 1 })
    .withMessage('prNumber must be a positive integer'),
  body('pullRequests.*.number')
    .optional()
    .isInt({ min: 1 })
    .withMessage('number must be a positive integer'),
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
    const invalidPullRequests = normalizedPullRequests
      .map((pullRequest, index) => ({
        index,
        prNumber: pullRequest.prNumber,
      }))
      .filter((pullRequest) => !pullRequest.prNumber);

    if (invalidPullRequests.length > 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'One or more pull requests could not be normalized into the required shape',
        errors: invalidPullRequests.map((pullRequest) => ({
          msg: 'Pull request number is required',
          path: `pullRequests[${pullRequest.index}]`,
          value: null,
        })),
      });
    }

    const binding = await IntegrationBinding.findOne({
      where: { teamId },
    });

    if (!binding) {
      return res.status(404).json({
        code: 'INTEGRATION_BINDING_NOT_FOUND',
        message: 'No integration binding exists for this team',
      });
    }

    const providers = Array.isArray(binding.providerSet)
      ? binding.providerSet.map((provider) => String(provider).toUpperCase())
      : [];
    if (!providers.includes('GITHUB')) {
      return res.status(409).json({
        code: 'GITHUB_PROVIDER_NOT_ENABLED',
        message: 'This team is not bound to GitHub integration',
      });
    }

    await sequelize.transaction(async (transaction) => {
      for (let index = 0; index < normalizedPullRequests.length; index += 1) {
        const normalized = normalizedPullRequests[index];
        const source = req.body.pullRequests[index] && typeof req.body.pullRequests[index] === 'object'
          ? req.body.pullRequests[index]
          : {};
        const pullRequest = source.pull_request && typeof source.pull_request === 'object'
          ? source.pull_request
          : source.pullRequest && typeof source.pullRequest === 'object'
            ? source.pullRequest
            : source;

        await SprintPullRequest.upsert({
          teamId,
          sprintId,
          prNumber: normalized.prNumber,
          relatedIssueKey: normalized.issueKey,
          branchName: normalized.branchName,
          title: typeof pullRequest.title === 'string' ? pullRequest.title.trim() || null : null,
          prStatus: normalized.prStatus,
          mergeStatus: normalized.mergeStatus,
          changedFiles: normalized.changedFiles,
          diffSummary: normalized.diffSummary,
          sourceCreatedAt: pullRequest.created_at || pullRequest.createdAt || null,
          sourceUpdatedAt: pullRequest.updated_at || pullRequest.updatedAt || null,
          sourceMergedAt: pullRequest.merged_at || pullRequest.mergedAt || null,
          url: pullRequest.html_url || pullRequest.url || null,
        }, { transaction });
      }
    });

    console.info('Received GitHub PR ingestion event', {
      teamId,
      sprintId,
      receivedAt,
      pullRequestCount: normalizedPullRequests.length,
      pullRequests: normalizedPullRequests,
    });

    return res.status(201).json({
      id: `op_${randomUUID()}`,
      status: 'ACCEPTED',
      message: 'GitHub PR data received successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      receivedCount: normalizedPullRequests.length,
      storedPullRequestCount: normalizedPullRequests.length,
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
