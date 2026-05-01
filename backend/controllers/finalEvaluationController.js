const { validationResult, param } = require('express-validator');
const { validate: isUUID } = require('uuid');
const finalEvaluationService = require('../services/finalEvaluationService');

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

async function finalize(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  const { groupId } = req.params;

  try {
    const grades = await finalEvaluationService.finalize(groupId);
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Final grades computed and stored',
      data: grades.map(serialize),
    });
  } catch (err) {
    return handleServiceError(err, res);
  }
}

async function getGrades(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', errors: errors.array() });
  }

  const { groupId } = req.params;

  try {
    const grades = await finalEvaluationService.getFinalGrades(groupId);
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Final grades retrieved',
      data: grades.map(serialize),
    });
  } catch (err) {
    return handleServiceError(err, res);
  }
}

function serialize(g) {
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

function handleServiceError(err, res) {
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

module.exports = { finalize, getGrades, finalizeValidation, getGradesValidation };
