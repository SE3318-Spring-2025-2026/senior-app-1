'use strict';

const sequelize = require('../db');
const {
  Group,
  FinalEvaluationGrade,
  FinalEvaluationWeight,
  Deliverable,
  TeamScalar,
  SprintMemberRecord,
  User,
  AuditLog,
  MemberFinalGrade,
  GroupAdvisorAssignment,
} = require('../models');
const ApiError = require('../errors/apiError');
const WEIGHT_TOLERANCE = 0.001;

function serviceError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function computeFinalScore(scores) {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw serviceError('VALIDATION_ERROR', 'scores must be a non-empty array');
  }

  let sum = 0;
  for (const s of scores) {
    const value = Number(s?.value);
    if (!s?.criterionId) {
      throw serviceError('VALIDATION_ERROR', 'each score must have a criterionId');
    }
    if (Number.isNaN(value) || value < 0 || value > 1) {
      throw serviceError('VALIDATION_ERROR', 'score value must be between 0 and 1');
    }
    sum += value;
  }

  return Number((sum / scores.length).toFixed(2));
}

function mapLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function assertGroupExistsAndUnlocked(groupId) {
  const group = await assertGroupExists(groupId);
  if (group.status === 'FINALIZED') {
    throw serviceError('FINALIZATION_LOCK_ERROR', 'Cannot submit/update grades after finalization');
  }
  const p64Lock = await MemberFinalGrade.findOne({
    where: { groupId },
    attributes: ['id'],
  });
  if (p64Lock) {
    throw serviceError(
      'FINALIZATION_LOCK_ERROR',
      'Cannot submit/update grades after per-member grades have been finalized',
    );
  }
  return group;
}

async function assertGroupExists(groupId) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');
  return group;
}

async function logGradeSubmitted({ actorId, grade }) {
  try {
    await AuditLog.create({
      action: 'GRADE_SUBMITTED',
      actorId,
      targetType: 'FINAL_EVALUATION_GRADE',
      targetId: grade.id,
      metadata: {
        groupId: grade.groupId,
        deliverableId: grade.deliverableId,
        gradeType: grade.gradeType,
      },
    });
  } catch {
    // Logging must never break the grade submission.
  }
}

async function submitAdvisorGrade({ groupId, deliverableId, advisorUser, scores, comments }) {
  const group = await assertGroupExistsAndUnlocked(groupId);

  const assignment = await GroupAdvisorAssignment.findOne({
    where: { groupId, advisorUserId: advisorUser.id },
  });
  if (!assignment) {
    throw serviceError('FORBIDDEN', 'Only assigned advisor can submit advisor grade');
  }

  const deliverable = await Deliverable.findByPk(deliverableId);
  if (!deliverable || deliverable.groupId !== groupId) {
    throw serviceError('DELIVERABLE_NOT_FOUND', 'Deliverable not found');
  }

  const existing = await FinalEvaluationGrade.findOne({
    where: { groupId, deliverableId, gradeType: 'ADVISOR', gradedBy: advisorUser.id },
  });
  if (existing) throw serviceError('ADVISOR_GRADE_EXISTS', 'Advisor grade already exists');

  const finalScore = computeFinalScore(scores);
  const grade = await FinalEvaluationGrade.create({
    groupId,
    deliverableId,
    gradeType: 'ADVISOR',
    gradedBy: advisorUser.id,
    scores,
    finalScore,
    comments: comments ?? null,
  });
  await logGradeSubmitted({ actorId: advisorUser.id, grade });
  return grade;
}

async function updateAdvisorGrade({ groupId, deliverableId, advisorUser, scores, comments }) {
  const group = await assertGroupExistsAndUnlocked(groupId);

  const assignment = await GroupAdvisorAssignment.findOne({
    where: { groupId, advisorUserId: advisorUser.id },
  });
  if (!assignment) {
    throw serviceError('FORBIDDEN', 'Only assigned advisor can update advisor grade');
  }

  const existing = await FinalEvaluationGrade.findOne({
    where: { groupId, deliverableId, gradeType: 'ADVISOR', gradedBy: advisorUser.id },
  });
  if (!existing) throw serviceError('GRADE_NOT_FOUND', 'Advisor grade not found');

  const finalScore = computeFinalScore(scores);
  const updated = await existing.update({
    scores,
    finalScore,
    comments: comments ?? null,
  });
  return updated;
}

async function submitCommitteeGrade({ groupId, deliverableId, professorUser, scores, comments }) {
  await assertGroupExistsAndUnlocked(groupId);

  const deliverable = await Deliverable.findByPk(deliverableId);
  if (!deliverable || deliverable.groupId !== groupId) {
    throw serviceError('DELIVERABLE_NOT_FOUND', 'Deliverable not found');
  }

  const existing = await FinalEvaluationGrade.findOne({
    where: { groupId, deliverableId, gradeType: 'COMMITTEE', gradedBy: professorUser.id },
  });
  if (existing) throw serviceError('COMMITTEE_GRADE_EXISTS', 'Committee grade already exists');

  const finalScore = computeFinalScore(scores);
  const grade = await FinalEvaluationGrade.create({
    groupId,
    deliverableId,
    gradeType: 'COMMITTEE',
    gradedBy: professorUser.id,
    scores,
    finalScore,
    comments: comments ?? null,
  });
  await logGradeSubmitted({ actorId: professorUser.id, grade });
  return grade;
}

async function updateCommitteeGrade({ groupId, deliverableId, professorUser, scores, comments }) {
  await assertGroupExistsAndUnlocked(groupId);

  const deliverable = await Deliverable.findByPk(deliverableId);
  if (!deliverable || deliverable.groupId !== groupId) {
    throw serviceError('DELIVERABLE_NOT_FOUND', 'Deliverable not found');
  }

  const existing = await FinalEvaluationGrade.findOne({
    where: { groupId, deliverableId, gradeType: 'COMMITTEE', gradedBy: professorUser.id },
  });
  if (existing) {
    const finalScore = computeFinalScore(scores);
    return existing.update({
      scores,
      finalScore,
      comments: comments ?? null,
    });
  }

  const anyForDeliverable = await FinalEvaluationGrade.findOne({
    where: { groupId, deliverableId, gradeType: 'COMMITTEE' },
  });
  if (anyForDeliverable) {
    throw serviceError('FORBIDDEN', 'Only the original reviewer can update this committee grade');
  }

  throw serviceError('GRADE_NOT_FOUND', 'Committee grade not found');
}

async function calculateTeamScalar(groupId) {
  const group = await Group.findByPk(groupId);
  if (!group) throw serviceError('GROUP_NOT_FOUND', 'Group not found');

  const advisorGrade = await FinalEvaluationGrade.findOne({
    where: { groupId, gradeType: 'ADVISOR' },
    order: [['createdAt', 'DESC']],
  });
  if (!advisorGrade) {
    throw serviceError('GRADES_INCOMPLETE', 'Advisor grade has not been submitted for this group');
  }

  const committeeGrades = await FinalEvaluationGrade.findAll({
    where: { groupId, gradeType: 'COMMITTEE' },
    order: [['createdAt', 'DESC']],
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

async function getMyGrade(user) {
  const userId = String(user.id);

  const groups = await Group.findAll({ attributes: ['id', 'memberIds'] });
  const group = groups.find(
    (g) => Array.isArray(g.memberIds) && g.memberIds.map(String).includes(userId),
  );

  if (!group) {
    throw ApiError.notFound('GROUP_NOT_FOUND', 'No group found for this student');
  }

  const grade = await MemberFinalGrade.findOne({
    where: { userId: user.id, groupId: group.id },
  });

  if (!grade) {
    throw ApiError.notFound(
      'GRADE_NOT_FOUND',
      'Coordinator has not finalized grades for your group yet',
    );
  }

  return {
    userId: grade.userId,
    groupId: grade.groupId,
    finalScore: grade.finalScore,
    letterGrade: grade.letterGrade,
    finalizedAt: grade.finalizedAt,
  };
}

async function getRawGrades(groupId) {
  await assertGroupExists(groupId);

  const advisorGrade = await FinalEvaluationGrade.findOne({
    where: { groupId, gradeType: 'ADVISOR' },
    order: [['createdAt', 'DESC']],
  });

  const committeeGrades = await FinalEvaluationGrade.findAll({
    where: { groupId, gradeType: 'COMMITTEE' },
    order: [['createdAt', 'DESC']],
  });

  return {
    groupId,
    advisorGrade,
    committeeGrades,
  };
}

async function setWeightConfig(advisorWeight, committeeWeight, updatedBy) {
  const advisor = Number(advisorWeight);
  const committee = Number(committeeWeight);

  if (Number.isNaN(advisor) || Number.isNaN(committee)) {
    throw serviceError('VALIDATION_ERROR', 'advisorWeight and committeeWeight must be numbers');
  }
  if (advisor < 0 || advisor > 1 || committee < 0 || committee > 1) {
    throw serviceError('VALIDATION_ERROR', 'advisorWeight and committeeWeight must be between 0 and 1');
  }
  if (Math.abs(advisor + committee - 1) > WEIGHT_TOLERANCE) {
    throw serviceError('WEIGHTS_MUST_SUM_TO_ONE', 'advisorWeight and committeeWeight must sum to 1.0');
  }

  return sequelize.transaction(async (t) => {
    await FinalEvaluationWeight.update(
      { isActive: false },
      { where: { isActive: true }, transaction: t },
    );

    return FinalEvaluationWeight.create(
      {
        advisorWeight: advisor,
        committeeWeight: committee,
        updatedBy: updatedBy || null,
        isActive: true,
      },
      { transaction: t },
    );
  });
}

async function getWeightConfig() {
  return FinalEvaluationWeight.findOne({
    where: { isActive: true },
    order: [['createdAt', 'DESC']],
  });
}

/**
 * Finalize and persist per-member grades for a group.
 *
 * Uses getTeamScalar / getContributions by default, but allows DI for tests.
 */
async function finalize(groupId, deps = {}) {
  if (!groupId) {
    const err = new Error('groupId is required');
    err.code = 'MISSING_GROUP_ID';
    throw err;
  }

  const teamScalarFn = deps.getTeamScalar || _defaultGetTeamScalarValue;
  const contributionsFn = deps.getContributions || _defaultGetContributionsArray;

  const teamScalar = await teamScalarFn(groupId);

  if (typeof teamScalar !== 'number' || Number.isNaN(teamScalar)) {
    const err = new Error('Team scalar is unavailable for this group');
    err.code = 'TEAM_SCALAR_UNAVAILABLE';
    throw err;
  }

  const contributions = await contributionsFn(groupId);

  if (!Array.isArray(contributions) || contributions.length === 0) {
    const err = new Error('No contribution data found for this group');
    err.code = 'CONTRIBUTIONS_UNAVAILABLE';
    throw err;
  }

  const rows = contributions.map(({ userId, ratio }) => {
    const finalScore = parseFloat(Math.min(100, teamScalar * ratio / 100).toFixed(2));
    return {
      groupId,
      userId,
      teamScalar,
      contributionRatio: ratio,
      finalScore,
      letterGrade: mapLetter(finalScore),
    };
  });

  return sequelize.transaction(async (t) => {
    await MemberFinalGrade.destroy({ where: { groupId }, transaction: t });
    return MemberFinalGrade.bulkCreate(rows, { transaction: t });
  });
}

async function getFinalGrades(groupId) {
  if (!groupId) {
    const err = new Error('groupId is required');
    err.code = 'MISSING_GROUP_ID';
    throw err;
  }

  return MemberFinalGrade.findAll({
    where: { groupId },
    order: [['userId', 'ASC']],
  });
}

async function _defaultGetTeamScalarValue(groupId) {
  try {
    const ts = await getTeamScalar(groupId);
    return Number(ts.scalar);
  } catch (err) {
    const e = new Error('Team scalar is unavailable for this group');
    e.code = 'TEAM_SCALAR_UNAVAILABLE';
    throw e;
  }
}

async function _defaultGetContributionsArray(groupId) {
  try {
    const result = await getContributions(groupId);
    return result.members.map((m) => ({
      userId: m.userId,
      ratio: m.contributionRatio * 100,
    }));
  } catch (err) {
    const e = new Error('No contribution data found for this group');
    e.code = 'CONTRIBUTIONS_UNAVAILABLE';
    throw e;
  }
}

module.exports = {
  submitAdvisorGrade,
  updateAdvisorGrade,
  submitCommitteeGrade,
  updateCommitteeGrade,
  calculateTeamScalar,
  getTeamScalar,
  getContributions,
  getMyGrade,
  getRawGrades,
  setWeightConfig,
  getWeightConfig,
  finalize,
  getFinalGrades,
  mapLetter,
};
