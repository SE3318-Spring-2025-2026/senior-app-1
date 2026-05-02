const { aggregateEvaluationInput } = require('../services/evaluationAggregationService');

// GET /internal/evaluations/aggregate/:teamId/:sprintId
async function getAggregatedEvaluationInput(req, res, next) {
  try {
    const { teamId, sprintId } = req.params;
    if (!teamId || !sprintId) {
      return res.status(400).json({ error: 'Missing teamId or sprintId' });
    }
    const result = await aggregateEvaluationInput(teamId, sprintId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAggregatedEvaluationInput };
