const sequelize = require('../db');
const { MemberFinalGrade } = require('../models');

function mapLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Finalize and persist per-member grades for a group.
 *
 * Assumes getTeamScalar(groupId) and getContributions(groupId) already exist
 * and are imported from their respective modules when available.
 * For now they are expected to be injected via the deps parameter so this
 * service remains testable without a live integration pipeline.
 *
 * @param {string} groupId
 * @param {{ getTeamScalar: Function, getContributions: Function }} deps
 * @returns {Promise<MemberFinalGrade[]>}
 */
async function finalize(groupId, deps = {}) {
  if (!groupId) {
    const err = new Error('groupId is required');
    err.code = 'MISSING_GROUP_ID';
    throw err;
  }

  const getTeamScalar = deps.getTeamScalar || _stubGetTeamScalar;
  const getContributions = deps.getContributions || _stubGetContributions;

  const teamScalar = await getTeamScalar(groupId);

  if (typeof teamScalar !== 'number' || Number.isNaN(teamScalar)) {
    const err = new Error('Team scalar is unavailable for this group');
    err.code = 'TEAM_SCALAR_UNAVAILABLE';
    throw err;
  }

  const contributions = await getContributions(groupId);

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

/**
 * Retrieve stored final grades for a group.
 *
 * @param {string} groupId
 * @returns {Promise<MemberFinalGrade[]>}
 */
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

// These stubs are replaced in production by injecting the real service functions.
async function _stubGetTeamScalar() {
  const err = new Error('getTeamScalar not injected');
  err.code = 'TEAM_SCALAR_UNAVAILABLE';
  throw err;
}

async function _stubGetContributions() {
  const err = new Error('getContributions not injected');
  err.code = 'CONTRIBUTIONS_UNAVAILABLE';
  throw err;
}

module.exports = { finalize, getFinalGrades, mapLetter };
