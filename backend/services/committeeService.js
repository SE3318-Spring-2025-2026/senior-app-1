const { Op } = require('sequelize');
const sequelize = require('../db');
const { GradingRubric, Deliverable, CommitteeReview, Group } = require('../models');

function calculateFinalScore(scores, criteriaMap) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const score of scores) {
    const criterion = criteriaMap.get(score.criterionId);
    if (!criterion) continue;
    weightedSum += (score.value / criterion.maxPoints) * criterion.weight;
    totalWeight += criterion.weight;
  }

  if (totalWeight === 0) return 0;
  return (weightedSum / totalWeight) * 100;
}

async function submitReview({ submissionId, reviewerId, scores, comments }) {
  const submission = await Deliverable.findByPk(submissionId);
  if (!submission) {
    const err = new Error('Submission not found');
    err.code = 'SUBMISSION_NOT_FOUND';
    throw err;
  }

  const criterionIds = scores.map((s) => s.criterionId);
  const uniqueCriterionIds = new Set(criterionIds);
  if (uniqueCriterionIds.size !== criterionIds.length) {
    const err = new Error('Duplicate criterionIds are not allowed in a single review');
    err.code = 'DUPLICATE_CRITERION_ID';
    throw err;
  }

  const rubric = await GradingRubric.findOne({
    where: { deliverableType: submission.type },
    order: [['createdAt', 'DESC']],
  });
  const criteriaList = rubric?.criteria || [];
  const criteriaMap = new Map(criteriaList.map((c) => [c.id, c]));

  const missing = criterionIds.filter((id) => !criteriaMap.has(id));
  if (missing.length > 0) {
    const err = new Error(`Invalid criterion IDs: ${missing.join(', ')}`);
    err.code = 'INVALID_CRITERION_ID';
    err.details = missing;
    throw err;
  }

  for (const score of scores) {
    const criterion = criteriaMap.get(score.criterionId);
    if (score.value > criterion.maxPoints) {
      const err = new Error(
        `Score ${score.value} exceeds maxPoints ${criterion.maxPoints} for criterion ${score.criterionId}`
      );
      err.code = 'SCORE_EXCEEDS_MAX';
      err.details = { criterionId: score.criterionId, value: score.value, maxPoints: criterion.maxPoints };
      throw err;
    }
  }

  const finalScore = calculateFinalScore(scores, criteriaMap);

  const transaction = await sequelize.transaction();
  try {
    const review = await CommitteeReview.create(
      { submissionId, reviewerId, scores, comments: comments || null, finalScore },
      { transaction }
    );

    await Deliverable.update(
      { status: 'GRADED' },
      { where: { id: submissionId }, transaction }
    );

    await transaction.commit();
    return review;
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function listRubricCriteria({ deliverableType } = {}) {
  if (deliverableType) {
    const rubric = await GradingRubric.findOne({
      where: { deliverableType },
      order: [['createdAt', 'DESC']],
    });
    return rubric?.criteria || [];
  }
  const rubrics = await GradingRubric.findAll({ order: [['createdAt', 'DESC']] });
  return rubrics.flatMap((r) => r.criteria || []);
}

async function listPendingSubmissions() {
  return Deliverable.findAll({
    where: { status: { [Op.ne]: 'GRADED' } },
    include: [{ model: Group, as: 'group', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });
}

module.exports = { submitReview, listRubricCriteria, listPendingSubmissions };
