const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');

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
    .isISO8601()
    .withMessage('receivedAt must be a valid ISO 8601 datetime'),
  body('pullRequests')
    .isArray({ min: 1 })
    .withMessage('pullRequests must be a non-empty array'),
  body('pullRequests.*')
    .isObject()
    .withMessage('each pull request entry must be an object'),
  body('pullRequests.*.prNumber')
    .isInt({ min: 1 })
    .withMessage('prNumber must be a positive integer'),
  body('pullRequests.*.branchName')
    .isString()
    .withMessage('branchName must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('branchName is required'),
  body('pullRequests.*.prStatus')
    .isString()
    .withMessage('prStatus must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('prStatus is required'),
  body('pullRequests.*.issueKey')
    .optional({ nullable: true })
    .isString()
    .withMessage('issueKey must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('issueKey must be a non-empty string when provided'),
  body('pullRequests.*.mergeStatus')
    .optional({ nullable: true })
    .isString()
    .withMessage('mergeStatus must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('mergeStatus must be a non-empty string when provided'),
  body('pullRequests.*.diffSummary')
    .optional({ nullable: true })
    .isString()
    .withMessage('diffSummary must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('diffSummary must be a non-empty string when provided'),
  body('pullRequests.*.changedFiles')
    .optional({ nullable: true })
    .isArray()
    .withMessage('changedFiles must be an array when provided'),
  body('pullRequests.*.changedFiles.*')
    .optional({ nullable: true })
    .isString()
    .withMessage('changedFiles entries must be strings')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('changedFiles entries must be non-empty strings'),
];

function normalizePullRequestData(pullRequest) {
  return {
    prNumber: Number(pullRequest.prNumber),
    issueKey: pullRequest.issueKey == null ? null : String(pullRequest.issueKey).trim(),
    branchName: String(pullRequest.branchName).trim(),
    prStatus: String(pullRequest.prStatus).trim(),
    mergeStatus: pullRequest.mergeStatus == null ? null : String(pullRequest.mergeStatus).trim(),
    diffSummary: pullRequest.diffSummary == null ? null : String(pullRequest.diffSummary).trim(),
    changedFiles: Array.isArray(pullRequest.changedFiles)
      ? pullRequest.changedFiles.map((fileName) => String(fileName).trim())
      : [],
  };
}

async function receiveGitHubPrData(req, res) {
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
  const receivedAt = String(req.body.receivedAt);
  const normalizedPullRequests = req.body.pullRequests.map(normalizePullRequestData);

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
  });
}

module.exports = {
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
};