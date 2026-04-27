const { DeliverableRubric, AuditLog } = require('../models');

async function createRubric({ deliverableName, criteria, totalPoints, courseId, actorId }) {
  const derivedTotal = criteria.reduce((sum, c) => sum + c.maxPoints, 0);
  if (derivedTotal !== totalPoints) {
    const err = new Error(`totalPoints (${totalPoints}) must equal the sum of criteria maxPoints (${derivedTotal})`);
    err.code = 'TOTAL_POINTS_MISMATCH';
    err.status = 400;
    throw err;
  }

  const rubric = await DeliverableRubric.create({
    deliverableName,
    criteria,
    totalPoints,
    courseId: courseId ?? null,
  });

  AuditLog.create({
    action: 'RUBRIC_CONFIGURED',
    actorId: actorId ?? null,
    targetType: 'DELIVERABLE_RUBRIC',
    targetId: rubric.id,
    metadata: {
      deliverableName,
      totalPoints,
      criteriaCount: criteria.length,
      criteria,
      courseId: courseId ?? null,
      eventType: 'RUBRIC_CONFIGURATION',
    },
  }).catch((err) => console.error('[deliverableRubricService] audit log failed:', err));

  return rubric;
}

module.exports = { createRubric };
