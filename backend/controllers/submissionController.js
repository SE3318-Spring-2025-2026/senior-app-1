/**
 * controllers/submissionController.js
 *
 * HTTP handlers for deliverable submission endpoints.
 * Implements submission with D6 logging (Issue #257).
 */

const { validationResult, body, param } = require('express-validator');
const SubmissionService = require('../services/submissionService');
const { v4: isUUID } = require('uuid');

/**
 * Validation middleware for POST /api/v1/groups/:groupId/deliverables
 */
const submitDeliverableValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
  body('type')
    .isIn(['PROPOSAL', 'SOW'])
    .withMessage('Deliverable type must be PROPOSAL or SOW'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Deliverable content is required')
    .isLength({ min: 10 })
    .withMessage('Deliverable content must be at least 10 characters'),
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array of URLs'),
];

/**
 * Validation middleware for GET /api/v1/groups/:groupId/deliverables
 */
const listDeliverableValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
];

/**
 * POST /api/v1/groups/:groupId/deliverables
 *
 * Submit or update a deliverable for a group.
 * Logs the submission to D6 (Audit Logs) asynchronously.
 *
 * Auth: STUDENT (team leader)
 *
 * Request body:
 * {
 *   type: "PROPOSAL" | "SOW",
 *   content: string (markdown),
 *   images: [url1, url2, ...] (optional)
 * }
 *
 * Response: 201
 * {
 *   code: "SUCCESS",
 *   data: {
 *     id: UUID,
 *     groupId: UUID,
 *     type: "PROPOSAL" | "SOW",
 *     status: "SUBMITTED",
 *     version: number,
 *     createdAt: ISO timestamp,
 *     updatedAt: ISO timestamp
 *   }
 * }
 */
async function submitDeliverable(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid submission data',
      errors: errors.array(),
    });
  }

  const { groupId } = req.params;
  const { type, content, images } = req.body;
  const submittedBy = req.user?.id;

  try {
    const deliverable = await SubmissionService.submitDeliverable({
      groupId,
      type,
      content,
      images,
      submitBy: submittedBy,
    });

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Deliverable submitted successfully',
      data: {
        id: deliverable.id,
        groupId: deliverable.groupId,
        type: deliverable.type,
        status: deliverable.status,
        version: deliverable.version,
        createdAt: deliverable.createdAt,
        updatedAt: deliverable.updatedAt,
      },
    });
  } catch (error) {
    if (
      error.code &&
      [
        'INVALID_GROUP_ID',
        'INVALID_DELIVERABLE_TYPE',
        'INVALID_CONTENT',
        'INVALID_SUBMITTER',
        'GROUP_NOT_FOUND',
      ].includes(error.code)
    ) {
      const statusCode = error.code === 'GROUP_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({
        code: error.code,
        message: error.message,
      });
    }

    console.error('Error submitting deliverable:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to submit deliverable',
    });
  }
}

/**
 * GET /api/v1/groups/:groupId/deliverables
 *
 * List all deliverables for a group.
 *
 * Auth: STUDENT (group member), PROFESSOR, COORDINATOR
 *
 * Response: 200
 * {
 *   code: "SUCCESS",
 *   data: [
 *     { id, type, status, version, createdAt },
 *     ...
 *   ]
 * }
 */
async function listDeliverables(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid group ID',
      errors: errors.array(),
    });
  }

  const { groupId } = req.params;

  try {
    const deliverables = await SubmissionService.listGroupSubmissions(groupId);

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Deliverables retrieved successfully',
      data: deliverables.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        version: d.version,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Error listing deliverables:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve deliverables',
    });
  }
}

module.exports = {
  submitDeliverable,
  listDeliverables,
  submitDeliverableValidation,
  listDeliverableValidation,
};
