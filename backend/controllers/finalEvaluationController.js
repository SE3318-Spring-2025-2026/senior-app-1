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

module.exports = {
  groupIdValidation,
  postTeamScalar,
  getTeamScalarHandler,
  getContributionsHandler,
};
