const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const sequelize = require('../db');
const { IntegrationBinding, SprintStory } = require('../models');
const { normalizeJiraIssue } = require('../services/jiraIssueNormalizer');

function hasJiraProvider(binding) {
  const providers = Array.isArray(binding?.providerSet)
    ? binding.providerSet.map((provider) => String(provider).toUpperCase())
    : [];

  return providers.includes('JIRA');
}

function findMissingRequiredFields(issue) {
  const missingFields = [];

  if (!issue.issueKey) {
    missingFields.push('issueKey');
  }
  if (!issue.title) {
    missingFields.push('title');
  }
  if (!issue.status || issue.status === 'UNKNOWN') {
    missingFields.push('status');
  }
  if (!issue.sprintId) {
    missingFields.push('sprintId');
  }

  return missingFields;
}

function findSprintMismatchIssues(issues, sprintId) {
  return issues
    .map((issue, index) => ({
      index,
      issueKey: issue.issueKey,
      sprintId: issue.sprintId,
    }))
    .filter((issue) => issue.sprintId !== sprintId);
}

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

    if (!hasJiraProvider(binding)) {
      return res.status(409).json({
        code: 'JIRA_PROVIDER_NOT_ENABLED',
        message: 'This team is not bound to Jira integration',
      });
    }

    const normalizedIssues = req.body.issues.map((issue) => normalizeJiraIssue(issue, {
      fallbackSprintId: sprintId,
    }));

    const invalidIssues = normalizedIssues
      .map((issue, index) => ({
        index,
        issueKey: issue.issueKey,
        missingFields: findMissingRequiredFields(issue),
      }))
      .filter((entry) => entry.missingFields.length > 0);

    if (invalidIssues.length > 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'One or more Jira issues could not be normalized into the required shape',
        errors: invalidIssues.map((entry) => ({
          msg: `Issue is missing required fields: ${entry.missingFields.join(', ')}`,
          path: `issues[${entry.index}]`,
          value: entry.issueKey ?? null,
        })),
      });
    }

    const sprintMismatchIssues = findSprintMismatchIssues(normalizedIssues, sprintId);
    if (sprintMismatchIssues.length > 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'One or more Jira issues do not belong to the requested sprint',
        errors: sprintMismatchIssues.map((issue) => ({
          msg: 'Issue sprintId does not match the request sprintId',
          path: `issues[${issue.index}]`,
          value: issue.issueKey ?? issue.sprintId,
        })),
      });
    }

    const uniqueIssueKeys = new Set(normalizedIssues.map((issue) => issue.issueKey));
    if (uniqueIssueKeys.size !== normalizedIssues.length) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Duplicate Jira issues in request payload',
      });
    }

    await sequelize.transaction(async (transaction) => {
      for (const issue of normalizedIssues) {
        await SprintStory.upsert({
          teamId,
          sprintId: issue.sprintId,
          issueKey: issue.issueKey,
          title: issue.title,
          description: issue.description,
          assigneeId: issue.assigneeId,
          reporterId: issue.reporterId,
          status: issue.status,
          storyPoints: issue.storyPoints,
          sourceCreatedAt: issue.sourceCreatedAt,
          sourceUpdatedAt: issue.sourceUpdatedAt,
        }, { transaction });
      }
    });

    return res.status(201).json({
      id: `op_${randomUUID()}`,
      status: 'STORED',
      message: 'Jira issues received successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      receivedCount: normalizedIssues.length,
      storedStoryCount: normalizedIssues.length,
    });
  } catch (error) {
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
