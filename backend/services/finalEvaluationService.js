'use strict';

const {
  Group,
  FinalEvaluationGrade,
  FinalEvaluationWeight,
  TeamScalar,
  SprintMemberRecord,
  User,
  Deliverable,
  AuditLog,
} = require('../models');

function serviceError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function calculateFinalScore(scores) {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw serviceError('INVALID_SCORES', 'At least one score is required');
  }
  return parseFloat((scores.reduce((sum, score) => sum + score.value, 0) / scores.length).toFixed(4));
}

async function submitAdvisorGrade({ groupId, deliverableId, gradedBy, scores, comments }) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');

  if (String(group.advisorId || '') !== String(gradedBy)) {
    throw serviceError('NOT_ASSIGNED_ADVISOR', 'Only the assigned advisor can submit advisor grade');
  }

  const deliverable = await Deliverable.findOne({ where: { id: deliverableId, groupId } });
  if (!deliverable) throw serviceError('DELIVERABLE_NOT_FOUND', 'Deliverable not found');

  const existing = await FinalEvaluationGrade.findOne({
    where: {
      groupId,
      gradeType: 'ADVISOR',
      gradedBy,
    },
  });
  if (existing) {
    throw serviceError('GRADE_ALREADY_SUBMITTED', 'Advisor grade already submitted');
  }

  const grade = await FinalEvaluationGrade.create({
    groupId,
    gradeType: 'ADVISOR',
    gradedBy,
    scores,
    finalScore: calculateFinalScore(scores),
    comments: comments ?? null,
  });

  _logGradingEvent({
    actorId: gradedBy,
    gradeId: grade.id,
    groupId,
    deliverableId,
    graderRole: 'ADVISOR',
    gradeType: 'ADVISOR',
  }).catch((err) => console.error('[finalEvaluationService] audit log failed:', err));

  return grade;
}

async function submitCommitteeGrade({ groupId, deliverableId, gradedBy, scores, comments }) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');

  const deliverable = await Deliverable.findOne({ where: { id: deliverableId, groupId } });
  if (!deliverable) throw serviceError('DELIVERABLE_NOT_FOUND', 'Deliverable not found');

  const existing = await FinalEvaluationGrade.findOne({
    where: {
      groupId,
      gradeType: 'COMMITTEE',
      gradedBy,
    },
  });
  if (existing) {
    throw serviceError('GRADE_ALREADY_SUBMITTED', 'Committee grade already submitted');
  }

  const grade = await FinalEvaluationGrade.create({
    groupId,
    gradeType: 'COMMITTEE',
    gradedBy,
    scores,
    finalScore: calculateFinalScore(scores),
    comments: comments ?? null,
  });

  _logGradingEvent({
    actorId: gradedBy,
    gradeId: grade.id,
    groupId,
    deliverableId,
    graderRole: 'COMMITTEE',
    gradeType: 'COMMITTEE',
  }).catch((err) => console.error('[finalEvaluationService] audit log failed:', err));

  return grade;
}

function _logGradingEvent({ actorId, gradeId, groupId, deliverableId, graderRole, gradeType }) {
  return AuditLog.create({
    action: 'GRADE_SUBMITTED',
    actorId,
    targetType: 'GRADE',
    targetId: gradeId,
    metadata: {
      groupId,
      deliverableId,
      graderRole,
      gradeType,
      timestamp: new Date().toISOString(),
    },
  });
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

async function getContributions(groupId) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');

  const records = await SprintMemberRecord.findAll({ where: { groupId } });
  if (!records.length) {
    throw serviceError('NO_SPRINT_SYNC_DATA', 'No sprint sync data found for this group');
  }

  const memberMap = {};
  for (const r of records) {
    if (!memberMap[r.userId]) {
      memberMap[r.userId] = { userId: r.userId, storyPointsCompleted: 0, totalCommits: 0 };
    }
    memberMap[r.userId].storyPointsCompleted += r.storyPointsCompleted;
    memberMap[r.userId].totalCommits += r.commitCount;
  }

  const members = Object.values(memberMap);

  const userIds = members.map((m) => m.userId);
  const users = await User.findAll({ where: { id: userIds } });
  const userNameMap = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  for (const m of members) {
    m.fullName = userNameMap[m.userId] || 'Unknown';
  }

  const totalStoryPoints = members.reduce((sum, m) => sum + m.storyPointsCompleted, 0);
  const totalCommits = members.reduce((sum, m) => sum + m.totalCommits, 0);

  for (const m of members) {
    if (totalStoryPoints > 0) {
      m.contributionRatio = m.storyPointsCompleted / totalStoryPoints;
    } else if (totalCommits > 0) {
      m.contributionRatio = m.totalCommits / totalCommits;
    } else {
      m.contributionRatio = 1 / members.length;
    }
  }

  return {
    groupId,
    members,
    computedAt: new Date(),
  };
}

module.exports = {
  submitAdvisorGrade,
  submitCommitteeGrade,
  calculateTeamScalar,
  getTeamScalar,
  getContributions,
};
