"use strict";

const { param, body, validationResult } = require("express-validator");
const FinalEvaluationService = require("../services/finalEvaluationService");
const { validate: isUUID } = require("uuid");

// Advisor grade validation (0-100 scale)
const submitAdvisorGradeValidation = [
  param("groupId").isUUID().withMessage("Group ID must be a valid UUID"),
  body("deliverableId").isUUID().withMessage("Deliverable ID must be a valid UUID"),
  body("scores").isArray({ min: 1 }).withMessage("At least one score is required"),
  body("scores.*.criterionId").notEmpty().withMessage("Each score must have a criterionId"),
  body("scores.*.value").isFloat({ min: 0, max: 100 }).withMessage("Score value must be between 0 and 100"),
  body("comments").optional().isString(),
];

const updateAdvisorGradeValidation = [
  param("groupId").isUUID().withMessage("Group ID must be a valid UUID"),
  body("deliverableId").isUUID().withMessage("Deliverable ID must be a valid UUID"),
  body("scores").isArray({ min: 1 }).withMessage("At least one score is required"),
  body("scores.*.criterionId").notEmpty().withMessage("Each score must have a criterionId"),
  body("scores.*.value").isFloat({ min: 0, max: 100 }).withMessage("Score value must be between 0 and 100"),
  body("comments").optional().isString(),
];

"use strict";

const { param, body, validationResult } = require("express-validator");
const FinalEvaluationService = require("../services/finalEvaluationService");

// Advisor grade validation (0-100 scale)
const submitAdvisorGradeValidation = [
  param("groupId").isUUID().withMessage("Group ID must be a valid UUID"),
  body("deliverableId").isUUID().withMessage("Deliverable ID must be a valid UUID"),
  body("scores").isArray({ min: 1 }).withMessage("At least one score is required"),
  body("scores.*.criterionId").notEmpty().withMessage("Each score must have a criterionId"),
  body("scores.*.value").isFloat({ min: 0, max: 100 }).withMessage("Score value must be between 0 and 100"),
  body("comments").optional().isString(),
];

const updateAdvisorGradeValidation = [
  param("groupId").isUUID().withMessage("Group ID must be a valid UUID"),
  body("deliverableId").isUUID().withMessage("Deliverable ID must be a valid UUID"),
  body("scores").isArray({ min: 1 }).withMessage("At least one score is required"),
  body("scores.*.criterionId").notEmpty().withMessage("Each score must have a criterionId"),
  body("scores.*.value").isFloat({ min: 0, max: 100 }).withMessage("Score value must be between 0 and 100"),
  body("comments").optional().isString(),
];

async function submitAdvisorGrade(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }
  try {
    const groupId = req.params.groupId;
    const advisorId = req.user.id;
    const { deliverableId, scores, comments } = req.body;
    const grade = await FinalEvaluationService.submitAdvisorGrade({ groupId, deliverableId, advisorId, scores, comments });
    return res.status(201).json({
      code: 'SUCCESS',
      message: 'Advisor grade submitted',
      data: grade,
    });
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ code: 'FORBIDDEN', message: err.message });
    }
    if (err.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: err.message });
    }
    if (err.code === 'DELIVERABLE_NOT_FOUND') {
      return res.status(404).json({ code: 'DELIVERABLE_NOT_FOUND', message: err.message });
    }
    if (err.code === 'ADVISOR_GRADE_EXISTS') {
      return res.status(409).json({ code: 'ADVISOR_GRADE_EXISTS', message: err.message });
    }
    if (err.code === 'INVALID_SCORES' || err.code === 'INVALID_SCORE_FORMAT' || err.code === 'INVALID_SCORE_VALUE') {
      return res.status(400).json({ code: err.code, message: err.message });
    }
    return next(err);
  }
}

async function updateAdvisorGrade(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }
  try {
    const groupId = req.params.groupId;
    const advisorId = req.user.id;
    const { deliverableId, scores, comments } = req.body;
    const grade = await FinalEvaluationService.updateAdvisorGrade({ groupId, deliverableId, advisorId, scores, comments });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Advisor grade updated',
      data: grade,
    });
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ code: 'FORBIDDEN', message: err.message });
    }
    if (err.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: err.message });
    }
    if (err.code === 'DELIVERABLE_NOT_FOUND') {
      return res.status(404).json({ code: 'DELIVERABLE_NOT_FOUND', message: err.message });
    }
    if (err.code === 'GRADE_NOT_FOUND') {
      return res.status(404).json({ code: 'GRADE_NOT_FOUND', message: err.message });
    }
    if (err.code === 'INVALID_SCORES' || err.code === 'INVALID_SCORE_FORMAT' || err.code === 'INVALID_SCORE_VALUE') {
      return res.status(400).json({ code: err.code, message: err.message });
    }
    return next(err);
  }
}

module.exports = {
  submitAdvisorGradeValidation,
  updateAdvisorGradeValidation,
  submitAdvisorGrade,
  updateAdvisorGrade,
};
