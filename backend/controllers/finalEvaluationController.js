<<<<<<< HEAD
"use strict";

const { param, body, validationResult } = require("express-validator");
const FinalEvaluationService = require("../services/finalEvaluationService");
const { Group } = require("../models");
const { validate: isUUID } = require("uuid");

// Committee grade validation
const submitCommitteeGradeValidation = [
  param("groupId")
    .custom((value) => isUUID(value))
    .withMessage("Group ID must be a valid UUID"),
  body("deliverableId")
    .custom((value) => isUUID(value))
    .withMessage("Deliverable ID must be a valid UUID"),
  body("scores")
    .isArray({ min: 1 })
    .withMessage("At least one score is required"),
  body("scores.*.criterionId")
    .notEmpty()
    .withMessage("Each score must have a criterionId"),
  body("scores.*.value")
    .isFloat({ min: 0, max: 1 })
    .withMessage("Score value must be between 0 and 1"),
  body("comments")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Comments must be 2000 characters or less"),
];

const updateCommitteeGradeValidation = [...submitCommitteeGradeValidation];

const submitCommitteeGrade = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const reviewerId = req.user.id;
    const grade = await FinalEvaluationService.submitCommitteeGrade({
      groupId,
      deliverableId,
      submittedBy: reviewerId,
      scores,
      comments,
    });
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
    if (error.code === "INVALID_GROUP_ID" || error.code === "INVALID_DELIVERABLE_ID") {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === "GROUP_NOT_FOUND" || error.code === "DELIVERABLE_NOT_FOUND") {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "DELIVERABLE_GROUP_MISMATCH") {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "DUPLICATE_REVIEWER_ERROR") {
      return res.status(409).json({ message: error.message });
    }
    if (error.code === "FINALIZATION_LOCK_ERROR") {
      return res.status(403).json({ message: error.message });
    }
    if (
      error.code === "INVALID_SCORES" ||
      error.code === "INVALID_SCORE_FORMAT" ||
      error.code === "INVALID_SCORE_VALUE"
    ) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[finalEvaluationController] Unexpected error in submitCommitteeGrade:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateCommitteeGrade = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const reviewerId = req.user.id;
    const grade = await FinalEvaluationService.updateCommitteeGrade({
      groupId,
      deliverableId,
      submittedBy: reviewerId,
      scores,
      comments,
    });
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
    if (error.code === "INVALID_GROUP_ID" || error.code === "INVALID_DELIVERABLE_ID") {
      return res.status(400).json({ message: error.message });
    }
    if (
      error.code === "GROUP_NOT_FOUND" ||
      error.code === "DELIVERABLE_NOT_FOUND" ||
      error.code === "GRADE_NOT_FOUND"
    ) {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "DELIVERABLE_GROUP_MISMATCH") {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "FINALIZATION_LOCK_ERROR") {
      return res.status(403).json({ message: error.message });
    }
    if (
      error.code === "INVALID_SCORES" ||
      error.code === "INVALID_SCORE_FORMAT" ||
      error.code === "INVALID_SCORE_VALUE"
    ) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[finalEvaluationController] Unexpected error in updateCommitteeGrade:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Advisor grade validation
const submitAdvisorGradeValidation = [
  param("groupId")
    .custom((value) => isUUID(value))
    .withMessage("Group ID must be a valid UUID"),
  body("deliverableId")
    .custom((value) => isUUID(value))
    .withMessage("Deliverable ID must be a valid UUID"),
  body("scores")
    .isArray({ min: 1 })
    .withMessage("At least one score is required"),
  body("scores.*.criterionId")
    .notEmpty()
    .withMessage("Each score must have a criterionId"),
  body("scores.*.value")
    .isFloat({ min: 0, max: 1 })
    .withMessage("Score value must be between 0 and 1"),
  body("comments")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Comments must be 2000 characters or less"),
];

const updateAdvisorGradeValidation = [...submitAdvisorGradeValidation];

const submitAdvisorGrade = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const advisorId = req.user.id;
    const grade = await FinalEvaluationService.submitAdvisorGrade({
      groupId,
      deliverableId,
      advisorId,
      scores,
      comments,
    });
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
    if (error.code === "INVALID_GROUP_ID" || error.code === "INVALID_DELIVERABLE_ID") {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === "GROUP_NOT_FOUND" || error.code === "DELIVERABLE_NOT_FOUND") {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "DELIVERABLE_GROUP_MISMATCH") {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "ADVISOR_GRADE_EXISTS") {
      return res.status(409).json({ message: error.message });
    }
    if (error.code === "FINALIZATION_LOCK_ERROR") {
      return res.status(403).json({ message: error.message });
    }
    if (
      error.code === "INVALID_SCORES" ||
      error.code === "INVALID_SCORE_FORMAT" ||
      error.code === "INVALID_SCORE_VALUE"
    ) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[finalEvaluationController] Unexpected error in submitAdvisorGrade:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateAdvisorGrade = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    const { groupId } = req.params;
    const { deliverableId, scores, comments } = req.body;
    const advisorId = req.user.id;
    const grade = await FinalEvaluationService.updateAdvisorGrade({
      groupId,
      deliverableId,
      advisorId,
      scores,
      comments,
    });
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
    if (error.code === "INVALID_GROUP_ID" || error.code === "INVALID_DELIVERABLE_ID") {
      return res.status(400).json({ message: error.message });
    }
    if (
      error.code === "GROUP_NOT_FOUND" ||
      error.code === "DELIVERABLE_NOT_FOUND" ||
      error.code === "GRADE_NOT_FOUND"
    ) {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "DELIVERABLE_GROUP_MISMATCH") {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === "FINALIZATION_LOCK_ERROR") {
      return res.status(403).json({ message: error.message });
    }
    if (
      error.code === "INVALID_SCORES" ||
      error.code === "INVALID_SCORE_FORMAT" ||
      error.code === "INVALID_SCORE_VALUE"
    ) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[finalEvaluationController] Unexpected error in updateAdvisorGrade:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const getGradesForGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const groupExists = await Group.findByPk(groupId);
    if (!groupExists) {
      return res.status(404).json({ message: "Group not found" });
    }
    const grades = await FinalEvaluationService.getGradesForGroup(groupId);
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
    console.error("[finalEvaluationController] Unexpected error in getGradesForGroup:", error);
    return res.status(500).json({ message: "Internal Server Error" });
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
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: errors.array() 
      });
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
>>>>>>> f902514 (fix: Add VALIDATION_ERROR envelope to all validation responses)
  }

  try {
<<<<<<< HEAD
    const result = await calculateTeamScalar(req.params.groupId);
=======
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: errors.array() 
      });
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
>>>>>>> f902514 (fix: Add VALIDATION_ERROR envelope to all validation responses)
=======
// ADVISOR GRADE ENDPOINTS
const { body } = require('express-validator');
const { submitAdvisorGrade } = require('../services/finalEvaluationService');

const submitAdvisorGradeValidation = [
  param('groupId').isUUID().withMessage('Group ID must be a valid UUID'),
  body('finalScore').isFloat({ min: 0, max: 100 }).withMessage('finalScore must be between 0 and 100'),
  body('scores').optional().isArray(),
  body('comments').optional().isString(),
  body('deliverableId').optional().isUUID().withMessage('If provided, deliverableId must be a valid UUID'),
];

async function postAdvisorGrade(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;
    const { finalScore, scores, comments, deliverableId } = req.body;
    const result = await submitAdvisorGrade({ groupId, userId, finalScore, scores, comments, deliverableId });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Advisor grade submitted',
      data: result,
    });
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ code: 'FORBIDDEN', message: err.message });
    }
    if (err.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: err.message });
    }
    return next(err);
  }
}

module.exports.submitAdvisorGradeValidation = submitAdvisorGradeValidation;
module.exports.postAdvisorGrade = postAdvisorGrade;
'use strict';

const { param, validationResult } = require('express-validator');
const { calculateTeamScalar, getTeamScalar, getContributions } = require('../services/finalEvaluationService');

const groupIdValidation = [
  param('groupId').isUUID().withMessage('groupId must be a valid UUID'),
];

function scalarResponse(ts) {
  return {
    groupId: ts.groupId,
    scalar: ts.scalar,
    advisorFinalScore: ts.advisorFinalScore,
    committeeFinalScore: ts.committeeFinalScore,
    weightConfigId: ts.weightConfigId,
    calculatedAt: ts.calculatedAt,
  };
}

async function postTeamScalar(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await calculateTeamScalar(req.params.groupId);
>>>>>>> 163acc7 (feat: add advisor grade endpoint, service, and validation (PR #366 requirements, conflict-free))
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Team scalar calculated and stored',
      data: scalarResponse(result),
    });
  } catch (err) {
    if (err.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: err.message });
    }
    if (err.code === 'GRADES_INCOMPLETE') {
      return res.status(422).json({ code: 'GRADES_INCOMPLETE', message: err.message });
    }
    if (err.code === 'NO_WEIGHT_CONFIG') {
      return res.status(422).json({ code: 'NO_WEIGHT_CONFIG', message: err.message });
    }
    console.error('calculateTeamScalar error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 163acc7 (feat: add advisor grade endpoint, service, and validation (PR #366 requirements, conflict-free))
async function getTeamScalarHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
<<<<<<< HEAD
=======
/**
 * Validation middleware for POST /api/v1/final-evaluation/groups/:groupId/advisor-grade
 */
const submitAdvisorGradeValidation = [
<<<<<<< HEAD
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
=======
  param('groupId').isUUID().withMessage('Group ID must be a valid UUID'),
  body('finalScore').isFloat({ min: 0, max: 100 }).withMessage('finalScore must be between 0 and 100'),
  body('scores').optional().isArray(),
  body('comments').optional().isString(),
  body('deliverableId').optional().isUUID().withMessage('If provided, deliverableId must be a valid UUID'),
>>>>>>> 594c08e (Resolve all merge conflicts and standardize final evaluation logic (advisor/committee))
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
<<<<<<< HEAD
const submitAdvisorGrade = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: errors.array() 
      });
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
>>>>>>> f902514 (fix: Add VALIDATION_ERROR envelope to all validation responses)
  }
=======
async function postAdvisorGrade(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }
  try {
    const groupId = req.params.groupId;
    const userId = req.user.id;
    const { finalScore, scores, comments, deliverableId } = req.body;
    const result = await require('../services/finalEvaluationService').submitAdvisorGrade({ groupId, userId, finalScore, scores, comments, deliverableId });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Advisor grade submitted',
      data: result,
    });
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ code: 'FORBIDDEN', message: err.message });
    }
    if (err.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: err.message });
    }
    return next(err);
  }
}
>>>>>>> 594c08e (Resolve all merge conflicts and standardize final evaluation logic (advisor/committee))

  try {
<<<<<<< HEAD
    const result = await getTeamScalar(req.params.groupId);
=======
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: errors.array() 
      });
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
>>>>>>> f902514 (fix: Add VALIDATION_ERROR envelope to all validation responses)
=======
  }

  try {
    const result = await getTeamScalar(req.params.groupId);
>>>>>>> 163acc7 (feat: add advisor grade endpoint, service, and validation (PR #366 requirements, conflict-free))
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Team scalar retrieved',
      data: scalarResponse(result),
    });
  } catch (err) {
    if (err.code === 'TEAM_SCALAR_NOT_FOUND') {
      return res.status(404).json({ code: 'TEAM_SCALAR_NOT_FOUND', message: err.message });
    }
    console.error('getTeamScalar error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

async function getContributionsHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await getContributions(req.params.groupId);
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Contributions computed',
      data: result,
    });
  } catch (err) {
    if (err.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: err.message });
    }
    if (err.code === 'NO_SPRINT_SYNC_DATA') {
      return res.status(422).json({ code: 'NO_SPRINT_SYNC_DATA', message: err.message });
    }
    console.error('getContributions error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

<<<<<<< HEAD
  submitCommitteeGrade,
  submitCommitteeGradeValidation,
  updateCommitteeGrade,
  updateCommitteeGradeValidation,
  submitAdvisorGrade,
  submitAdvisorGradeValidation,
  updateAdvisorGrade,
  updateAdvisorGradeValidation,
  getGradesForGroup,
=======
module.exports = {
  groupIdValidation,
  postTeamScalar,
  getTeamScalarHandler,
  getContributionsHandler,
>>>>>>> 163acc7 (feat: add advisor grade endpoint, service, and validation (PR #366 requirements, conflict-free))
};
