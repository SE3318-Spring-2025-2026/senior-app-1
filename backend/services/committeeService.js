const { Op } = require('sequelize');
const { Deliverable, GradingRubric, CommitteeReview } = require('../models');

function calculateFinalScore(scores, criteriaMap) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const score of scores) {
    const criterion = criteriaMap.get(score.criterionId);
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

  const rubric = await GradingRubric.findOne({ where: { deliverableType: submission.type } });
  const criteria = rubric ? (rubric.criteria || []) : [];
  const criteriaMap = new Map(criteria.map((c) => [c.id, c]));

  const criterionIds = scores.map((s) => s.criterionId);
  const missing = criterionIds.filter((id) => !criteriaMap.has(id));
  if (missing.length > 0) {
    const err = new Error(`Invalid criterion IDs: ${missing.join(', ')}`);
    err.code = 'INVALID_CRITERION_ID';
    err.details = missing;
    throw err;
  }

  const finalScore = calculateFinalScore(scores, criteriaMap);
  const review = await CommitteeReview.create({
    submissionId,
    reviewerId,
    scores,
    comments: comments || null,
    finalScore,
  });
  return review;
}

async function listRubricCriteria({ deliverableType } = {}) {
  if (deliverableType) {
    const rubric = await GradingRubric.findOne({ where: { deliverableType } });
    return rubric ? (rubric.criteria || []) : [];
  }
  const rubrics = await GradingRubric.findAll();
  return rubrics.flatMap((r) => r.criteria || []);
}

async function listPendingSubmissions() {
  return Deliverable.findAll({
    where: { status: { [Op.ne]: 'GRADED' } },
    order: [['submittedAt', 'DESC']],
  });
}

module.exports = { submitReview, listRubricCriteria, listPendingSubmissions };
