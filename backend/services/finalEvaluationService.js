'use strict';

const { Group, FinalEvaluationGrade, FinalEvaluationWeight, TeamScalar } = require('../models');

function serviceError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function calculateTeamScalar(groupId) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');

  const advisorGrade = await FinalEvaluationGrade.findOne({
    where: { groupId, gradeType: 'ADVISOR' },
  });
  if (!advisorGrade) {
    throw serviceError('GRADES_INCOMPLETE', 'Advisor grade has not been submitted for this group');
  }

  const committeeGrades = await FinalEvaluationGrade.findAll({
    where: { groupId, gradeType: 'COMMITTEE' },
  });
  if (!committeeGrades.length) {
    throw serviceError('GRADES_INCOMPLETE', 'No committee grades exist for this group');
  }

  const weightConfig = await FinalEvaluationWeight.findOne({
    where: { isActive: true },
    order: [['createdAt', 'DESC']],
  });
  if (!weightConfig) {
    throw serviceError('NO_WEIGHT_CONFIG', 'No active weight configuration has been set');
  }

  const advisorFinalScore = advisorGrade.finalScore;
  const committeeFinalScore =
    committeeGrades.reduce((sum, g) => sum + g.finalScore, 0) / committeeGrades.length;
  const scalar =
    advisorFinalScore * weightConfig.advisorWeight +
    committeeFinalScore * weightConfig.committeeWeight;
  const calculatedAt = new Date();

  const existing = await TeamScalar.findOne({ where: { groupId } });
  if (existing) {
    await existing.update({
      scalar,
      advisorFinalScore,
      committeeFinalScore,
      weightConfigId: weightConfig.id,
      calculatedAt,
    });
    return existing;
  }

  return TeamScalar.create({
    groupId,
    scalar,
    advisorFinalScore,
    committeeFinalScore,
    weightConfigId: weightConfig.id,
    calculatedAt,
  });
}

async function getTeamScalar(groupId) {
  const ts = await TeamScalar.findOne({ where: { groupId } });
  if (!ts) {
    throw serviceError('TEAM_SCALAR_NOT_FOUND', 'Team scalar has not been calculated for this group');
  }
  return ts;
}

module.exports = { calculateTeamScalar, getTeamScalar };
