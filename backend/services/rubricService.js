'use strict';

const { GradingRubric, AuditLog } = require('../models');

async function upsertRubric(deliverableType, criteria, userId) {
  const [rubric] = await GradingRubric.upsert({
    deliverableType,
    criteria,
    updatedBy: userId ?? null,
  });
  return rubric;
}

async function getRubric(deliverableType) {
  return GradingRubric.findOne({ where: { deliverableType } });
}

async function listRubrics() {
  return GradingRubric.findAll();
}

async function createRubric({ deliverableType, name, criteria, actorId }) {
  if (!deliverableType || !['PROPOSAL', 'SOW'].includes(deliverableType)) {
    const error = new Error('Invalid deliverable type');
    error.code = 'INVALID_DELIVERABLE_TYPE';
    throw error;
  }

  if (!Array.isArray(criteria) || criteria.length === 0) {
    const error = new Error('At least one criterion is required');
    error.code = 'INVALID_CRITERIA';
    throw error;
  }

  for (let i = 0; i < criteria.length; i++) {
    const c = criteria[i];
    if (!c.question || !c.type || c.weight === undefined) {
      const error = new Error(`Criterion ${i} missing required fields`);
      error.code = 'INVALID_CRITERION_FORMAT';
      throw error;
    }
    if (!['BINARY', 'SOFT'].includes(c.type)) {
      const error = new Error(`Criterion ${i} has invalid type`);
      error.code = 'INVALID_CRITERION_TYPE';
      throw error;
    }
    if (typeof c.weight !== 'number' || c.weight < 0 || c.weight > 1) {
      const error = new Error(`Criterion ${i} weight must be 0-1`);
      error.code = 'INVALID_CRITERION_WEIGHT';
      throw error;
    }
  }

  const rubric = await GradingRubric.create({ deliverableType, criteria, updatedBy: actorId ?? null });

  AuditLog.create({
    action: 'RUBRIC_CREATED',
    actorId,
    targetType: 'GRADING_RUBRIC',
    targetId: rubric.id,
    metadata: {
      deliverableType,
      criteriaCount: criteria.length,
      eventType: 'RUBRIC_CONFIGURATION',
      timestamp: new Date().toISOString(),
    },
  }).catch((err) => console.error('[rubricService] audit log failed:', err));

  return rubric;
}

module.exports = { upsertRubric, getRubric, listRubrics, createRubric };
