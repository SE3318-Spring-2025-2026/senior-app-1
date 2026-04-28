const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');
const sequelize = require('../db');
const { PrMetric } = require('../models');

const storePrMetricsValidation = [
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
  body('pullRequests')
    .isArray({ min: 1 })
    .withMessage('pullRequests must be a non-empty array'),
  body('pullRequests.*.prNumber')
    .isInt({ min: 1 })
    .withMessage('prNumber must be a positive integer'),
  body('pullRequests.*.metricName')
    .isString()
    .withMessage('metricName must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('metricName is required'),
  body('pullRequests.*.metricValue')
    .isFloat({ min: 0 })
    .withMessage('metricValue must be a non-negative number'),
  body('pullRequests.*.unit')
    .isString()
    .withMessage('unit must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('unit is required'),
];

async function storePrMetrics(req, res) {
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
  const metrics = req.body.pullRequests.map((pullRequest) => ({
    teamId,
    sprintId,
    prNumber: Number(pullRequest.prNumber),
    metricName: pullRequest.metricName.trim(),
    metricValue: Number(pullRequest.metricValue),
    unit: pullRequest.unit.trim(),
  }));

  try {
    await sequelize.transaction(async (transaction) => {
      for (const metric of metrics) {
        await PrMetric.upsert(metric, { transaction });
      }
    });

    return res.status(201).json({
      id: `op_${randomUUID()}`,
      status: 'STORED',
      message: 'PR metrics stored successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      storedCount: metrics.length,
    });
  } catch (error) {
    console.error('Error in storePrMetrics:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to store PR metrics',
    });
  }
}

module.exports = {
  storePrMetricsValidation,
  storePrMetrics,
};
