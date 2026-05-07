'use strict';

// backend/controllers/finalEvaluationWeightController.js

const { body, validationResult } = require('express-validator');
const { setWeightConfig, getWeightConfig } = require('../services/finalEvaluationService');

// ---------------------------------------------------------------------------
// PUT /api/v1/final-evaluation/weight-configuration
// Auth: COORDINATOR only
// ---------------------------------------------------------------------------
const putWeightConfiguration = [
  body('advisorWeight')
    .notEmpty().withMessage('advisorWeight is required')
    .isFloat({ min: 0, max: 1 }).withMessage('advisorWeight must be a float between 0 and 1'),
  body('committeeWeight')
    .notEmpty().withMessage('committeeWeight is required')
    .isFloat({ min: 0, max: 1 }).withMessage('committeeWeight must be a float between 0 and 1'),

  async (req, res, next) => {
    // --- Basic validation (null / empty / type) ---
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: errors.array()[0].msg,
      });
    }

    const { advisorWeight, committeeWeight } = req.body;

    try {
      const config = await setWeightConfig(
        parseFloat(advisorWeight),
        parseFloat(committeeWeight),
        req.user.id
      );

      return res.status(200).json({
        advisorWeight: config.advisorWeight,
        committeeWeight: config.committeeWeight,
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }
      return next(error);
    }
  },
];

// ---------------------------------------------------------------------------
// GET /api/v1/final-evaluation/weight-configuration
// Auth: COORDINATOR, PROFESSOR, or ADVISOR
// ---------------------------------------------------------------------------
const getWeightConfiguration = async (req, res, next) => {
  try {
    const config = await getWeightConfig();

    if (!config) {
      return res.status(404).json({
        code: 'WEIGHT_CONFIG_NOT_FOUND',
        message: 'No weight configuration has been set yet.',
      });
    }

    return res.status(200).json({
      advisorWeight: config.advisorWeight,
      committeeWeight: config.committeeWeight,
      updatedBy: config.updatedBy,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  putWeightConfiguration,
  getWeightConfiguration,
};