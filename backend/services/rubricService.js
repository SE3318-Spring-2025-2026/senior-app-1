'use strict';

const { GradingRubric } = require('../models');

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

module.exports = { upsertRubric, getRubric, listRubrics };
