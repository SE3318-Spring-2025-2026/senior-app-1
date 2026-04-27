'use strict';

const { body, param, validationResult } = require('express-validator');
const rubricService = require('../services/rubricService');

const upsertRubricValidation = [
  body('deliverableType')
    .exists().withMessage('deliverableType is required')
    .bail()
    .isIn(['PROPOSAL', 'SOW']).withMessage('deliverableType must be PROPOSAL or SOW'),
  body('criteria')
    .exists().withMessage('criteria is required')
    .bail()
    .isArray({ min: 1 }).withMessage('criteria must be a non-empty array'),
  body('criteria.*.name')
    .isString().notEmpty().withMessage('each criterion must have a non-empty name'),
  body('criteria.*.maxPoints')
    .isFloat({ min: 0 }).withMessage('each criterion maxPoints must be >= 0'),
];

async function upsertRubric(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid rubric configuration',
      errors: errors.array(),
    });
  }

  const { deliverableType, criteria } = req.body;

  const names = criteria.map((c) => c.name);
  if (new Set(names).size !== names.length) {
    return res.status(400).json({
      code: 'DUPLICATE_CRITERION_NAME',
      message: 'criteria must not contain duplicate name entries',
    });
  }

  try {
    const rubric = await rubricService.upsertRubric(deliverableType, criteria, req.user?.id ?? null);
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Grading rubric updated successfully',
      rubric: {
        id: rubric.id,
        deliverableType: rubric.deliverableType,
        criteria: rubric.criteria,
        updatedBy: rubric.updatedBy,
        createdAt: rubric.createdAt,
        updatedAt: rubric.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error upserting rubric:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to update grading rubric' });
  }
}

async function getRubric(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid deliverableType', errors: errors.array() });
  }

  const { deliverableType } = req.params;

  try {
    const rubric = await rubricService.getRubric(deliverableType);
    if (!rubric) {
      return res.status(404).json({ code: 'RUBRIC_NOT_FOUND', message: `No rubric configured for ${deliverableType}` });
    }
    return res.status(200).json({ code: 'SUCCESS', rubric });
  } catch (error) {
    console.error('Error fetching rubric:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch grading rubric' });
  }
}

const getRubricValidation = [
  param('deliverableType')
    .isIn(['PROPOSAL', 'SOW']).withMessage('deliverableType must be PROPOSAL or SOW'),
];

async function listRubrics(req, res) {
  try {
    const rubrics = await rubricService.listRubrics();
    return res.status(200).json({ code: 'SUCCESS', rubrics });
  } catch (error) {
    console.error('Error listing rubrics:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to list grading rubrics' });
  }
}

module.exports = {
  upsertRubricValidation,
  upsertRubric,
  getRubricValidation,
  getRubric,
  listRubrics,
};
