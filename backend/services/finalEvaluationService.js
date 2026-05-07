'use strict';

// backend/services/finalEvaluationService.js  (weight-config section)
// Add these two functions to the file, or create it if it does not yet exist.

const { FinalEvaluationWeight } = require('../models');

const WEIGHT_TOLERANCE = 0.001;
// We keep exactly one config row by always targeting id = 1.
const SINGLETON_ID = 1;

/**
 * Upsert the advisor / committee weight configuration.
 *
 * @param {number} advisorWeight
 * @param {number} committeeWeight
 * @param {number} updatedBy  – User.id of the calling COORDINATOR
 * @returns {Promise<FinalEvaluationWeight>}
 */
async function setWeightConfig(advisorWeight, committeeWeight, updatedBy) {
  if (Math.abs(advisorWeight + committeeWeight - 1.0) > WEIGHT_TOLERANCE) {
    const err = new Error('advisorWeight and committeeWeight must sum to 1.0');
    err.code = 'WEIGHTS_MUST_SUM_TO_ONE';
    err.status = 400;
    throw err;
  }

  const [record] = await FinalEvaluationWeight.upsert(
    {
      id: SINGLETON_ID,
      advisorWeight,
      committeeWeight,
      updatedBy,
    },
    { returning: true }
  );

  return record;
}

/**
 * Return the active weight configuration, or null when none has been saved yet.
 *
 * @returns {Promise<FinalEvaluationWeight|null>}
 */
async function getWeightConfig() {
  return FinalEvaluationWeight.findOne({ where: { id: SINGLETON_ID } });
}

module.exports = {
  setWeightConfig,
  getWeightConfig,
};