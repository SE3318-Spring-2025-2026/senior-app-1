const SprintEvaluation = require('../models/SprintEvaluation');

/**
 * Upsert a sprint evaluation result for a given team and sprint.
 * If an evaluation exists, update it and preserve evaluationId.
 * @param {Object} data - Evaluation data
 * @returns {Promise<Object>} - The upserted evaluation document
 */
async function upsertSprintEvaluation(data) {
  const filter = { teamId: data.teamId, sprintId: data.sprintId };
  const update = {
    status: data.status,
    aggregatedScore: data.aggregatedScore,
    completionRate: data.completionRate,
    gradingSummary: data.gradingSummary,
    createdBy: data.createdBy,
    createdAt: data.createdAt || new Date()
  };
  // Find existing, update if found, else insert new (preserve evaluationId)
  const existing = await SprintEvaluation.findOne(filter);
  if (existing) {
    // Preserve evaluationId
    Object.assign(existing, update);
    await existing.save();
    return existing;
  } else {
    // evaluationId will be auto-generated
    const created = await SprintEvaluation.create({ ...filter, ...update });
    return created;
  }
}

/**
 * Get a sprint evaluation result for a given team and sprint.
 * @param {String} teamId
 * @param {String} sprintId
 * @returns {Promise<Object|null>}
 */
async function getSprintEvaluation(teamId, sprintId) {
  return SprintEvaluation.findOne({ teamId, sprintId });
}

module.exports = {
  upsertSprintEvaluation,
  getSprintEvaluation
};
