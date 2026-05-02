const { body, validationResult } = require('express-validator');
const { getTeamPullRequestData } = require('../services/githubPrDataService');
const ApiError = require('../errors/apiError');

const receiveGitHubPrDataValidation = [
  body('operationId').isString().trim().notEmpty().withMessage('operationId is required'),
  body('teamId').isString().trim().notEmpty().withMessage('teamId is required'),
  body('sprintId').isString().trim().notEmpty().withMessage('sprintId is required'),
  body('branchNames').optional().isArray().withMessage('branchNames must be an array'),
  body('relatedIssueKeys').optional().isArray().withMessage('relatedIssueKeys must be an array'),
  body('requestedBy').isString().trim().notEmpty().withMessage('requestedBy is required'),
];

async function receiveGitHubPrData(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  const {
    operationId,
    teamId,
    sprintId,
    branchNames = [],
    relatedIssueKeys = [],
    requestedBy,
  } = req.body;

  try {
    const pullRequests = await getTeamPullRequestData(teamId, {
      branchNames,
      issueKeys: relatedIssueKeys,
    });

    return res.status(201).json({
      code: 'ACCEPTED',
      message: 'GitHub PR data received and processed',
      data: {
        operationId,
        teamId,
        sprintId,
        receivedAt: new Date().toISOString(),
        pullRequests,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        code: error.code,
        message: error.message,
      });
    }

    console.error('Error in receiveGitHubPrData:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

exports.receiveGitHubPrDataValidation = receiveGitHubPrDataValidation;
exports.receiveGitHubPrData = receiveGitHubPrData;
