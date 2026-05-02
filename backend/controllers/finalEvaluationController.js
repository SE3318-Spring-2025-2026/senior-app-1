/**
 * controllers/finalEvaluationController.js
 *
 * HTTP handlers for final evaluation endpoints.
 * Implements committee grade submission with D6 logging (Issue #260, #368).
 */

const { validationResult, body, param } = require('express-validator');
const FinalEvaluationService = require('../services/finalEvaluationService');
const { Group } = require('../models');
const { validate: isUUID } = require('uuid');

/**
 * Validation middleware for POST /api/v1/final-evaluation/groups/:groupId/committee-grade
 */
const submitCommitteeGradeValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
  body('deliverableId')
    .custom((value) => isUUID(value))
    .withMessage('Deliverable ID must be a valid UUID'),
  body('scores')
    .isArray({ min: 1 })
    .withMessage('At least one score is required'),
  body('scores.*.criterionId')
    .notEmpty()
    .withMessage('Each score must have a criterionId'),
  body('scores.*.value')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Score value must be between 0 and 1'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Comments must be 2000 characters or less'),
];

/**
 * Validation middleware for PUT /api/v1/final-evaluation/groups/:groupId/committee-grade
 */
const updateCommitteeGradeValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
  body('deliverableId')
    .custom((value) => isUUID(value))
    .withMessage('Deliverable ID must be a valid UUID'),
  body('scores')
    .isArray({ min: 1 })
    .withMessage('At least one score is required'),
  body('scores.*.criterionId')
    .notEmpty()
    .withMessage('Each score must have a criterionId'),
  body('scores.*.value')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Score value must be between 0 and 1'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Comments must be 2000 characters or less'),
];

/**
 * POST /api/v1/final-evaluation/groups/:groupId/committee-grade
 *
 * Submit committee grade for a group deliverable.
 * Returns 201 with stored grade body.
 * Returns 401 with no auth header.
 * Returns 403 when caller is STUDENT or COORDINATOR.
 * Returns 404 if group or deliverable not found.
 * Returns 409 if the same reviewer already submitted for this deliverable.
 *
 * @async
 * @param {Object} req - Express request
 * @param {Object} req.user - Authenticated user (added by authenticate middleware)
 * @param {string} req.user.role - User role (checked by authorize middleware)
 * @param {string} req.params.groupId - Group UUID
 * @param {Object} req.body - Request body
 * @param {string} req.body.deliverableId - Deliverable UUID
 * @param {Array} req.body.scores - Array of {criterionId, value, note}
 * @param {string} [req.body.comments] - Optional feedback
 *
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 *
 * @returns {Promise<void>}
 */
const submitCommitteeGrade = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const reviewerId = req.user.id;

    // Submit grade via service
    const grade = await FinalEvaluationService.submitCommitteeGrade({
      groupId,
      deliverableId,
      submittedBy: reviewerId,
      scores,
      comments,
    });

    // Return 201 with stored grade
    return res.status(201).json({
      id: grade.id,
      groupId: grade.groupId,
      deliverableId: grade.deliverableId,
      submittedBy: grade.submittedBy,
      scores: grade.scores,
      comments: grade.comments,
      finalScore: grade.finalScore,
      createdAt: grade.createdAt,
      updatedAt: grade.updatedAt,
    });
  } catch (error) {
    // Handle service errors
    if (error.code === 'INVALID_GROUP_ID' || error.code === 'INVALID_DELIVERABLE_ID') {
      return res.status(400).json({ message: error.message });
    }

    if (error.code === 'GROUP_NOT_FOUND' || error.code === 'DELIVERABLE_NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'DELIVERABLE_GROUP_MISMATCH') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'DUPLICATE_REVIEWER_ERROR') {
      return res.status(409).json({ message: error.message });
    }

    if (error.code === 'FINALIZATION_LOCK_ERROR') {
      return res.status(403).json({ message: error.message });
    }

    // Generic validation errors
    if (error.code === 'INVALID_SCORES' || error.code === 'INVALID_SCORE_FORMAT' || error.code === 'INVALID_SCORE_VALUE') {
      return res.status(400).json({ message: error.message });
    }

    console.error('[finalEvaluationController] Unexpected error in submitCommitteeGrade:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * PUT /api/v1/final-evaluation/groups/:groupId/committee-grade
 *
 * Update committee grade for a group deliverable.
 * Returns 200 with updated grade.
 * Returns 401 with no auth header.
 * Returns 403 when caller is STUDENT or COORDINATOR or after finalization.
 * Returns 404 if group, deliverable, or grade not found.
 *
 * @async
 * @param {Object} req - Express request
 * @param {Object} req.user - Authenticated user
 * @param {string} req.user.role - User role
 * @param {string} req.params.groupId - Group UUID
 * @param {Object} req.body - Request body
 * @param {string} req.body.deliverableId - Deliverable UUID
 * @param {Array} req.body.scores - Array of {criterionId, value, note}
 * @param {string} [req.body.comments] - Optional feedback
 *
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 *
 * @returns {Promise<void>}
 */
const updateCommitteeGrade = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const reviewerId = req.user.id;

    // Update grade via service
    const grade = await FinalEvaluationService.updateCommitteeGrade({
      groupId,
      deliverableId,
      submittedBy: reviewerId,
      scores,
      comments,
    });

    // Return 200 with updated grade
    return res.status(200).json({
      id: grade.id,
      groupId: grade.groupId,
      deliverableId: grade.deliverableId,
      submittedBy: grade.submittedBy,
      scores: grade.scores,
      comments: grade.comments,
      finalScore: grade.finalScore,
      createdAt: grade.createdAt,
      updatedAt: grade.updatedAt,
    });
  } catch (error) {
    // Handle service errors
    if (error.code === 'INVALID_GROUP_ID' || error.code === 'INVALID_DELIVERABLE_ID') {
      return res.status(400).json({ message: error.message });
    }

    if (error.code === 'GROUP_NOT_FOUND' || error.code === 'DELIVERABLE_NOT_FOUND' || error.code === 'GRADE_NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'DELIVERABLE_GROUP_MISMATCH') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'FINALIZATION_LOCK_ERROR') {
      return res.status(403).json({ message: error.message });
    }

    // Generic validation errors
    if (error.code === 'INVALID_SCORES' || error.code === 'INVALID_SCORE_FORMAT' || error.code === 'INVALID_SCORE_VALUE') {
      return res.status(400).json({ message: error.message });
    }

    console.error('[finalEvaluationController] Unexpected error in updateCommitteeGrade:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * Validation middleware for POST /api/v1/final-evaluation/groups/:groupId/advisor-grade
 */
const submitAdvisorGradeValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
  body('deliverableId')
    .custom((value) => isUUID(value))
    .withMessage('Deliverable ID must be a valid UUID'),
  body('scores')
    .isArray({ min: 1 })
    .withMessage('At least one score is required'),
  body('scores.*.criterionId')
    .notEmpty()
    .withMessage('Each score must have a criterionId'),
  body('scores.*.value')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Score value must be between 0 and 1'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Comments must be 2000 characters or less'),
];

/**
 * Validation middleware for PUT /api/v1/final-evaluation/groups/:groupId/advisor-grade
 */
const updateAdvisorGradeValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
  body('deliverableId')
    .custom((value) => isUUID(value))
    .withMessage('Deliverable ID must be a valid UUID'),
  body('scores')
    .isArray({ min: 1 })
    .withMessage('At least one score is required'),
  body('scores.*.criterionId')
    .notEmpty()
    .withMessage('Each score must have a criterionId'),
  body('scores.*.value')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Score value must be between 0 and 1'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Comments must be 2000 characters or less'),
];

/**
 * POST /api/v1/final-evaluation/groups/:groupId/advisor-grade
 *
 * Submit advisor soft grade for a group deliverable.
 * Returns 201 with stored grade body.
 * Returns 401 with no auth header.
 * Returns 403 when caller is not the assigned advisor.
 * Returns 404 if group or deliverable not found.
 * Returns 409 if advisor already submitted (ADVISOR_GRADE_EXISTS).
 */
const submitAdvisorGrade = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const advisorId = req.user.id;

    // Submit grade via service
    const grade = await FinalEvaluationService.submitAdvisorGrade({
      groupId,
      deliverableId,
      advisorId,
      scores,
      comments,
    });

    // Return 201 with stored grade
    return res.status(201).json({
      id: grade.id,
      groupId: grade.groupId,
      deliverableId: grade.deliverableId,
      advisorId: grade.advisorId,
      scores: grade.scores,
      comments: grade.comments,
      finalScore: grade.finalScore,
      createdAt: grade.createdAt,
      updatedAt: grade.updatedAt,
    });
  } catch (error) {
    // Handle service errors
    if (error.code === 'INVALID_GROUP_ID' || error.code === 'INVALID_DELIVERABLE_ID') {
      return res.status(400).json({ message: error.message });
    }

    if (error.code === 'GROUP_NOT_FOUND' || error.code === 'DELIVERABLE_NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'DELIVERABLE_GROUP_MISMATCH') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'ADVISOR_GRADE_EXISTS') {
      return res.status(409).json({ message: error.message });
    }

    if (error.code === 'FINALIZATION_LOCK_ERROR') {
      return res.status(403).json({ message: error.message });
    }

    // Generic validation errors
    if (error.code === 'INVALID_SCORES' || error.code === 'INVALID_SCORE_FORMAT' || error.code === 'INVALID_SCORE_VALUE') {
      return res.status(400).json({ message: error.message });
    }

    console.error('[finalEvaluationController] Unexpected error in submitAdvisorGrade:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * PUT /api/v1/final-evaluation/groups/:groupId/advisor-grade
 *
 * Update advisor soft grade for a group deliverable.
 * Returns 200 with updated grade.
 * Returns 401 with no auth header.
 * Returns 403 when caller is not the assigned advisor or after finalization.
 * Returns 404 if group, deliverable, or grade not found.
 */
const updateAdvisorGrade = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const advisorId = req.user.id;

    // Update grade via service
    const grade = await FinalEvaluationService.updateAdvisorGrade({
      groupId,
      deliverableId,
      advisorId,
      scores,
      comments,
    });

    // Return 200 with updated grade
    return res.status(200).json({
      id: grade.id,
      groupId: grade.groupId,
      deliverableId: grade.deliverableId,
      advisorId: grade.advisorId,
      scores: grade.scores,
      comments: grade.comments,
      finalScore: grade.finalScore,
      createdAt: grade.createdAt,
      updatedAt: grade.updatedAt,
    });
  } catch (error) {
    // Handle service errors
    if (error.code === 'INVALID_GROUP_ID' || error.code === 'INVALID_DELIVERABLE_ID') {
      return res.status(400).json({ message: error.message });
    }

    if (error.code === 'GROUP_NOT_FOUND' || error.code === 'DELIVERABLE_NOT_FOUND' || error.code === 'GRADE_NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'DELIVERABLE_GROUP_MISMATCH') {
      return res.status(404).json({ message: error.message });
    }

    if (error.code === 'FINALIZATION_LOCK_ERROR') {
      return res.status(403).json({ message: error.message });
    }

    // Generic validation errors
    if (error.code === 'INVALID_SCORES' || error.code === 'INVALID_SCORE_FORMAT' || error.code === 'INVALID_SCORE_VALUE') {
      return res.status(400).json({ message: error.message });
    }

    console.error('[finalEvaluationController] Unexpected error in updateAdvisorGrade:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * GET /api/v1/final-evaluation/groups/:groupId/grades
 *
 * Get all grades (advisor and committee) for a group.
 * Returns { advisorGrades[], committeeGrades[] }
 * Returns 403 if caller is STUDENT.
 * Returns 404 if group not found.
 */
const getGradesForGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Verify group exists
    const groupExists = await Group.findByPk(groupId);
    if (!groupExists) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Get grades
    const grades = await FinalEvaluationService.getGradesForGroup(groupId);

    // Return 200 with grades
    return res.status(200).json({
      advisorGrades: grades.advisorGrades.map((g) => ({
        id: g.id,
        groupId: g.groupId,
        deliverableId: g.deliverableId,
        advisorId: g.advisorId,
        advisor: g.advisor,
        deliverable: g.deliverable,
        scores: g.scores,
        comments: g.comments,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
      committeeGrades: grades.committeeGrades.map((g) => ({
        id: g.id,
        groupId: g.groupId,
        deliverableId: g.deliverableId,
        submittedBy: g.submittedBy,
        reviewer: g.reviewer,
        deliverable: g.deliverable,
        scores: g.scores,
        comments: g.comments,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[finalEvaluationController] Unexpected error in getGradesForGroup:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  submitCommitteeGrade,
  submitCommitteeGradeValidation,
  updateCommitteeGrade,
  updateCommitteeGradeValidation,
  submitAdvisorGrade,
  submitAdvisorGradeValidation,
  updateAdvisorGrade,
  updateAdvisorGradeValidation,
  getGradesForGroup,
};
