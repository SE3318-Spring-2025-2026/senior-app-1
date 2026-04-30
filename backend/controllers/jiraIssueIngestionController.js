const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const sequelize = require('../db');
const { IntegrationBinding, StoryMetric } = require('../models');
const { normalizeJiraIssue } = require('../services/jiraIssueNormalizer');

function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function hasJiraProvider(binding) {
  const providers = Array.isArray(binding?.providerSet)
    ? binding.providerSet.map((provider) => String(provider).toUpperCase())
    : [];

  return providers.includes('JIRA');
}

function buildMetricKey(metric) {
  return [metric.issueKey, metric.metricName].join('::');
}

function findMissingRequiredFields(issue) {
  const missingFields = [];

  if (!issue.issueKey) {
    missingFields.push('issueKey');
  }
  if (!issue.title) {
    missingFields.push('title');
  }
  if (!issue.status) {
    missingFields.push('status');
  }
  if (!issue.sprintId) {
    missingFields.push('sprintId');
  }

  return missingFields;
}

function buildStoryPointMetrics(teamId, sprintId, issues) {
  return issues
    .filter((issue) => issue.storyPoints !== null)
    .map((issue) => ({
      teamId,
      sprintId,
      issueKey: issue.issueKey,
      metricName: 'storyPoints',
      metricValue: Number(issue.storyPoints),
      unit: 'points',
    }));
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

    const uniqueIssueKeys = new Set(normalizedIssues.map((issue) => issue.issueKey));
    if (uniqueIssueKeys.size !== normalizedIssues.length) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Duplicate Jira issues in request payload',
      });
    }

    const metrics = buildStoryPointMetrics(teamId, sprintId, normalizedIssues);
    const uniqueMetricKeys = new Set(metrics.map(buildMetricKey));

    await sequelize.transaction(async (transaction) => {
      for (const metric of metrics) {
        await StoryMetric.upsert(metric, { transaction });
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
      storedMetricCount: uniqueMetricKeys.size,
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
