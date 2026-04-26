const { DeliverableRubric } = require('../models');

async function createRubric({ deliverableName, criteria, totalPoints, courseId }) {
  const derivedTotal = criteria.reduce((sum, c) => sum + c.maxPoints, 0);
  if (derivedTotal !== totalPoints) {
    const err = new Error(`totalPoints (${totalPoints}) must equal the sum of criteria maxPoints (${derivedTotal})`);
    err.code = 'TOTAL_POINTS_MISMATCH';
    err.status = 400;
    throw err;
  }

  return DeliverableRubric.create({
    deliverableName,
    criteria,
    totalPoints,
    courseId: courseId ?? null,
  });
}

module.exports = { createRubric };
