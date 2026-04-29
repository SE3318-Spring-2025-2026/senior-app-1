const {
  upsertSprintEvaluation,
  getSprintEvaluation
} = require('../repositories/sprintEvaluationRepository');

/**
 * Create or update a sprint evaluation result.
 * Expects all required fields in req.body.
 */
async function createOrUpdateSprintEvaluation(req, res, next) {
  try {
    const { teamId, sprintId } = req.params;
    const {
      status,
      aggregatedScore,
      completionRate,
      gradingSummary,
      createdBy,
      createdAt
    } = req.body;

    // Basic validation

    // Validate required fields
    if (!teamId || !sprintId || !status || !createdBy) {
      return res.status(400).json({ error: 'Missing required fields: teamId, sprintId, status, createdBy.' });
    }
    if (!['SUCCESS', 'FAILED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value. Must be SUCCESS or FAILED.' });
    }
    // If status FAILED, metrics must be null or undefined
    if (status === 'FAILED' && ((aggregatedScore !== null && aggregatedScore !== undefined) || (completionRate !== null && completionRate !== undefined))) {
      return res.status(400).json({ error: 'Metrics must be null or undefined when status is FAILED.' });
    }
    // If status SUCCESS, metrics must be numbers
    if (status === 'SUCCESS' && (typeof aggregatedScore !== 'number' || typeof completionRate !== 'number')) {
      return res.status(400).json({ error: 'Metrics must be numbers when status is SUCCESS.' });
    }

    const evaluation = await upsertSprintEvaluation({
      teamId,
      sprintId,
      status,
      aggregatedScore,
      completionRate,
      gradingSummary,
      createdBy,
      createdAt
    });
    res.status(200).json(evaluation);
  } catch (err) {
    next(err);
  }
}

/**
 * Get a sprint evaluation result for a team and sprint.
 */
async function getSprintEvaluationResult(req, res, next) {
  try {
    const { teamId, sprintId } = req.params;
    const evaluation = await getSprintEvaluation(teamId, sprintId);
    if (!evaluation) {
      return res.status(404).json({ error: 'No evaluation result found.' });
    }
    res.status(200).json(evaluation);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrUpdateSprintEvaluation,
  getSprintEvaluationResult
};
