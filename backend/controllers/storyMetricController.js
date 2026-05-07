const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const sequelize = require('../db');
const { IntegrationBinding, StoryMetric } = require('../models');

const storeStoryMetricsValidation = [
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
  body('stories')
    .isArray({ min: 1 })
    .withMessage('stories must be a non-empty array'),
  body('stories.*.issueKey')
    .isString()
    .withMessage('issueKey must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('issueKey is required'),
  body('stories.*.metricName')
    .isString()
    .withMessage('metricName must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('metricName is required'),
  body('stories.*.metricValue')
    .isFloat({ min: 0 })
    .withMessage('metricValue must be a non-negative number'),
  body('stories.*.unit')
    .isString()
    .withMessage('unit must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('unit is required'),
];

function buildMetricKey(metric) {
  return [metric.issueKey, metric.metricName].join('::');
}

async function storeStoryMetrics(req, res) {
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
  const metrics = req.body.stories.map((story) => ({
    teamId,
    sprintId,
    issueKey: story.issueKey.trim(),
    metricName: story.metricName.trim(),
    metricValue: Number(story.metricValue),
    unit: story.unit.trim(),
  }));
  const uniqueMetricKeys = new Set(metrics.map(buildMetricKey));

  if (uniqueMetricKeys.size !== metrics.length) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Duplicate story metrics in request payload',
    });
  }

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

    await sequelize.transaction(async (transaction) => {
      for (const metric of metrics) {
        await StoryMetric.upsert(metric, { transaction });
      }
    });

    return res.status(201).json({
      id: `op_${randomUUID()}`,
      status: 'STORED',
      message: 'Story metrics stored successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      storedCount: uniqueMetricKeys.size,
    });
  } catch (error) {
    console.error('Error in storeStoryMetrics:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to store story metrics',
    });
  }
}

module.exports = {
  storeStoryMetricsValidation,
  storeStoryMetrics,
};
