const { body, validationResult } = require('express-validator');
const { SprintWeightConfiguration } = require('../models');

const updateWeightsValidation = [
  body('deliverableType')
    .exists().withMessage('deliverableType is required')
    .bail()
    .isIn(['PROPOSAL', 'SOW']).withMessage('deliverableType must be PROPOSAL or SOW'),
  body('sprintWeights')
    .exists().withMessage('sprintWeights is required')
    .bail()
    .isArray({ min: 1 }).withMessage('sprintWeights must be a non-empty array'),
  body('sprintWeights.*.sprintNumber')
    .isInt({ min: 1 }).withMessage('sprintNumber must be a positive integer'),
  body('sprintWeights.*.weightPercent')
    .isFloat({ min: 0, max: 100 }).withMessage('weightPercent must be between 0 and 100'),
];

async function updateWeights(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid weights configuration',
      errors: errors.array(),
    });
  }

  const { deliverableType, sprintWeights } = req.body;

  const sprintNumbers = sprintWeights.map((w) => w.sprintNumber);
  if (new Set(sprintNumbers).size !== sprintNumbers.length) {
    return res.status(400).json({
      code: 'DUPLICATE_SPRINT_NUMBER',
      message: 'sprintWeights must not contain duplicate sprintNumber entries',
    });
  }

  const total = sprintWeights.reduce((sum, w) => sum + Number(w.weightPercent), 0);
  if (Math.abs(total - 100) > 0.01) {
    return res.status(400).json({
      code: 'INVALID_WEIGHT_SUM',
      message: `sprintWeights must sum to 100, got ${total}`,
    });
  }

  try {
    const [config] = await SprintWeightConfiguration.upsert({
      deliverableType,
      sprintWeights,
      updatedBy: req.user?.id ?? null,
    });

    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Sprint weight configuration updated successfully',
      config: {
        id: config.id,
        deliverableType: config.deliverableType,
        sprintWeights: config.sprintWeights,
        updatedBy: config.updatedBy,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating sprint weights:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to update sprint weight configuration',
    });
  }
}

module.exports = {
  updateWeightsValidation,
  updateWeights,
};
