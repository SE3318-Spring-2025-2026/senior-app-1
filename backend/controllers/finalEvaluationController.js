'use strict';

const { body, param, validationResult } = require('express-validator');
const {
  submitAdvisorGrade,
  submitCommitteeGrade,
  calculateTeamScalar,
  getTeamScalar,
  getContributions,
} = require('../services/finalEvaluationService');

const groupIdValidation = [
  param('groupId').isUUID().withMessage('groupId must be a valid UUID'),
];

const gradePayloadValidation = [
  body('deliverableId').isUUID().withMessage('deliverableId must be a valid UUID'),
  body('scores').isArray({ min: 1 }).withMessage('scores must be a non-empty array'),
  body('scores.*.criterionId').isString().trim().notEmpty().withMessage('criterionId is required'),
  body('scores.*.value').isFloat({ min: 0, max: 1 }).withMessage('value must be between 0 and 1'),
  body('comments').optional({ nullable: true }).isString().withMessage('comments must be a string'),
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

async function postAdvisorGrade(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const grade = await submitAdvisorGrade({
      groupId: req.params.groupId,
      deliverableId: req.body.deliverableId,
      scores: req.body.scores,
      comments: req.body.comments,
      gradedBy: req.user.id,
    });
    return res.status(201).json({
      code: 'SUCCESS',
      message: 'Advisor grade submitted',
      data: {
        ...grade.toJSON(),
        deliverableId: req.body.deliverableId,
      },
    });
  } catch (err) {
    if (err.code === 'GROUP_NOT_FOUND' || err.code === 'DELIVERABLE_NOT_FOUND') {
      return res.status(404).json({ code: err.code, message: err.message });
    }
    if (err.code === 'NOT_ASSIGNED_ADVISOR') {
      return res.status(403).json({ code: err.code, message: err.message });
    }
    if (err.code === 'GRADE_ALREADY_SUBMITTED') {
      return res.status(409).json({ code: err.code, message: err.message });
    }
    console.error('submitAdvisorGrade error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

async function postCommitteeGrade(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  try {
    const grade = await submitCommitteeGrade({
      groupId: req.params.groupId,
      deliverableId: req.body.deliverableId,
      scores: req.body.scores,
      comments: req.body.comments,
      gradedBy: req.user.id,
    });
    return res.status(201).json({
      code: 'SUCCESS',
      message: 'Committee grade submitted',
      data: {
        ...grade.toJSON(),
        deliverableId: req.body.deliverableId,
      },
    });
  } catch (err) {
    if (err.code === 'GROUP_NOT_FOUND' || err.code === 'DELIVERABLE_NOT_FOUND') {
      return res.status(404).json({ code: err.code, message: err.message });
    }
    if (err.code === 'GRADE_ALREADY_SUBMITTED') {
      return res.status(409).json({ code: err.code, message: err.message });
    }
    console.error('submitCommitteeGrade error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

module.exports = {
  groupIdValidation,
  gradePayloadValidation,
  postAdvisorGrade,
  postCommitteeGrade,
  postTeamScalar,
  getTeamScalarHandler,
  getContributionsHandler,
};
