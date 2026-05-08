'use strict';

const { param, body, validationResult } = require('express-validator');
const { validate: isUUID } = require('uuid');
const finalEvaluationService = require('../services/finalEvaluationService');
const {
  calculateTeamScalar,
  getTeamScalar,
  getContributions,
  getMyGrade,
  submitAdvisorGrade,
  updateAdvisorGrade,
  submitCommitteeGrade,
  updateCommitteeGrade,
} = finalEvaluationService;

const groupIdValidation = [
  param('groupId').isUUID().withMessage('groupId must be a valid UUID'),
];

const gradeBodyValidation = [
  body('deliverableId').isUUID().withMessage('deliverableId must be a valid UUID'),
  body('scores').isArray({ min: 1 }).withMessage('scores must be a non-empty array'),
  body('scores.*.criterionId').notEmpty().withMessage('Each score must have a criterionId'),
  body('scores.*.value')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Score value must be between 0 and 1'),
  body('comments')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Comments must be 2000 characters or less'),
];

const finalizeValidation = [
  param('groupId')
    .custom((v) => isUUID(v) || (typeof v === 'string' && v.length > 0))
    .withMessage('groupId must be a non-empty string'),
];

const getGradesValidation = [
  param('groupId')
    .custom((v) => isUUID(v) || (typeof v === 'string' && v.length > 0))
    .withMessage('groupId must be a non-empty string'),
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

async function getTeamScalarHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await getTeamScalar(req.params.groupId);
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

async function myGrade(req, res, next) {
  try {
    const view = await getMyGrade(req.user);
    return res.status(200).json(view);
  } catch (err) {
    return next(err);
  }
}

function handleGradeError(err, res) {
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: err.message,
      errors: err.errors || [],
    });
  }
  if (err.code === 'FORBIDDEN' || err.code === 'FINALIZATION_LOCK_ERROR') {
    return res.status(403).json({ code: err.code, message: err.message });
  }
  if (err.code === 'GROUP_NOT_FOUND') {
    return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: err.message });
  }
  if (err.code === 'GRADE_NOT_FOUND') {
    return res.status(404).json({ code: 'GRADE_NOT_FOUND', message: err.message });
  }
  if (err.code === 'ADVISOR_GRADE_EXISTS' || err.code === 'COMMITTEE_GRADE_EXISTS') {
    return res.status(409).json({ code: err.code, message: err.message });
  }
  console.error('[finalEvaluationController]', err);
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

async function postAdvisorGrade(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await submitAdvisorGrade({
      groupId: req.params.groupId,
      deliverableId: req.body.deliverableId,
      advisorUser: req.user,
      scores: req.body.scores,
      comments: req.body.comments,
    });
    return res.status(201).json({ code: 'SUCCESS', message: 'Advisor grade submitted', data: result });
  } catch (err) {
    return handleGradeError(err, res);
  }
}

async function putAdvisorGrade(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await updateAdvisorGrade({
      groupId: req.params.groupId,
      deliverableId: req.body.deliverableId,
      advisorUser: req.user,
      scores: req.body.scores,
      comments: req.body.comments,
    });
    return res.status(200).json({ code: 'SUCCESS', message: 'Advisor grade updated', data: result });
  } catch (err) {
    return handleGradeError(err, res);
  }
}

async function postCommitteeGrade(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await submitCommitteeGrade({
      groupId: req.params.groupId,
      deliverableId: req.body.deliverableId,
      professorUser: req.user,
      scores: req.body.scores,
      comments: req.body.comments,
    });
    return res.status(201).json({ code: 'SUCCESS', message: 'Committee grade submitted', data: result });
  } catch (err) {
    return handleGradeError(err, res);
  }
}

async function putCommitteeGrade(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await updateCommitteeGrade({
      groupId: req.params.groupId,
      deliverableId: req.body.deliverableId,
      professorUser: req.user,
      scores: req.body.scores,
      comments: req.body.comments,
    });
    return res.status(200).json({ code: 'SUCCESS', message: 'Committee grade updated', data: result });
  } catch (err) {
    return handleGradeError(err, res);
  }
}

function serializeFinal(g) {
  return {
    id: g.id,
    groupId: g.groupId,
    userId: g.userId,
    teamScalar: g.teamScalar,
    contributionRatio: g.contributionRatio,
    finalScore: g.finalScore,
    letterGrade: g.letterGrade,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function handleFinalizeError(err, res) {
  const clientCodes = {
    MISSING_GROUP_ID: 400,
    TEAM_SCALAR_UNAVAILABLE: 422,
    CONTRIBUTIONS_UNAVAILABLE: 422,
  };

  if (err.code && clientCodes[err.code] !== undefined) {
    return res.status(clientCodes[err.code]).json({ code: err.code, message: err.message });
  }

  console.error('[finalEvaluationController]', err);
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to process final grades' });
}

async function finalize(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const grades = await finalEvaluationService.finalize(req.params.groupId);
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Final grades computed and stored',
      data: grades.map(serializeFinal),
    });
  } catch (err) {
    return handleFinalizeError(err, res);
  }
}

async function getGrades(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const grades = await finalEvaluationService.getFinalGrades(req.params.groupId);
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Final grades retrieved',
      data: grades.map(serializeFinal),
    });
  } catch (err) {
    return handleFinalizeError(err, res);
  }
}

async function getRawGrades(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const result = await finalEvaluationService.getRawGrades(req.params.groupId);
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Raw grades retrieved',
      data: {
        groupId: result.groupId,
        advisorGrade: result.advisorGrade,
        committeeGrades: result.committeeGrades,
      },
    });
  } catch (err) {
    return handleGradeError(err, res);
  }
}

module.exports = {
  groupIdValidation,
  gradeBodyValidation,
  finalizeValidation,
  getGradesValidation,
  postTeamScalar,
  getTeamScalarHandler,
  getContributionsHandler,
  myGrade,
  postAdvisorGrade,
  putAdvisorGrade,
  postCommitteeGrade,
  putCommitteeGrade,
  getRawGrades,
  finalize,
  getGrades,
};
