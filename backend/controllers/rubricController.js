/**
 * controllers/rubricController.js
 *
 * HTTP handlers for grading rubric endpoints.
 * Implements rubric creation with audit logging (Issue #255).
 */

const { validationResult, body } = require('express-validator');
const RubricService = require('../services/rubricService');

/**
 * Validation middleware for POST /api/v1/coordinator/rubrics
 */
const createRubricValidation = [
  body('deliverableType')
    .isIn(['PROPOSAL', 'SOW'])
    .withMessage('Deliverable type must be PROPOSAL or SOW'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Rubric name is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('Rubric name must be between 3 and 255 characters'),
  body('criteria')
    .isArray({ min: 1 })
    .withMessage('At least one criterion is required'),
  body('criteria.*.question')
    .trim()
    .notEmpty()
    .withMessage('Each criterion must have a question'),
  body('criteria.*.type')
    .isIn(['BINARY', 'SOFT'])
    .withMessage('Criterion type must be BINARY or SOFT'),
  body('criteria.*.weight')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Criterion weight must be between 0 and 1'),
];

/**
 * POST /api/v1/coordinator/rubrics
 *
 * Create a new grading rubric for a deliverable type.
 * Logs the action to D6 (Audit Logs) asynchronously.
 *
 * Auth: COORDINATOR only
 *
 * Request body:
 * {
 *   deliverableType: "PROPOSAL" | "SOW",
 *   name: string,
 *   criteria: [
 *     { question: string, type: "BINARY" | "SOFT", weight: 0-1 },
 *     ...
 *   ]
 * }
 *
 * Response: 201
 * {
 *   code: "SUCCESS",
 *   data: {
 *     id: UUID,
 *     deliverableType: string,
 *     name: string,
 *     criteria: [...],
 *     isActive: true,
 *     createdAt: ISO timestamp
 *   }
 * }
 */
async function createRubric(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid rubric data',
      errors: errors.array(),
    });
  }

  const { deliverableType, name, criteria } = req.body;
  const actorId = req.user?.id;

  try {
    const rubric = await RubricService.createRubric({
      deliverableType,
      name,
      criteria,
      actorId,
    });

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Rubric created successfully',
      data: {
        id: rubric.id,
        deliverableType: rubric.deliverableType,
        name: rubric.name,
        criteria: rubric.criteria,
        isActive: rubric.isActive,
        createdAt: rubric.createdAt,
      },
    });
  } catch (error) {
    if (
      error.code &&
      [
        'INVALID_DELIVERABLE_TYPE',
        'INVALID_RUBRIC_NAME',
        'INVALID_CRITERIA',
        'INVALID_CRITERION_FORMAT',
        'INVALID_CRITERION_TYPE',
        'INVALID_CRITERION_WEIGHT',
      ].includes(error.code)
    ) {
      return res.status(400).json({
        code: error.code,
        message: error.message,
      });
    }

    console.error('Error creating rubric:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create rubric',
    });
  }
}

/**
 * GET /api/v1/coordinator/rubrics
 *
 * List all rubrics (active and inactive).
 *
 * Auth: COORDINATOR only
 *
 * Response: 200
 * {
 *   code: "SUCCESS",
 *   data: [
 *     { id, deliverableType, name, isActive, createdAt },
 *     ...
 *   ]
 * }
 */
async function listRubrics(req, res) {
  try {
    const rubrics = await RubricService.listRubrics();

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Rubrics retrieved successfully',
      data: rubrics.map((r) => ({
        id: r.id,
        deliverableType: r.deliverableType,
        name: r.name,
        criteriaCount: Array.isArray(r.criteria) ? r.criteria.length : 0,
        isActive: r.isActive,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error listing rubrics:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve rubrics',
    });
  }
}

module.exports = {
  createRubric,
  listRubrics,
  createRubricValidation,
};
