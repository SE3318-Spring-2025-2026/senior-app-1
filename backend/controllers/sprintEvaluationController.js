<<<<<<< Persist-evaluation-results
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
=======
const { triggerSprintEvaluation } = require('../services/sprintEvaluationOrchestrator');

/**
 * Trigger sprint evaluation for a team and sprint (as orchestrator, no metrics in payload).
 * POST /teams/:teamId/sprints/:sprintId/evaluations
 */
async function triggerSprintEvaluationHandler(req, res, next) {
  try {
    const { teamId, sprintId } = req.params;
    const { createdBy } = req.body;
    if (!teamId || !sprintId || !createdBy) {
      return res.status(400).json({ error: 'Missing required fields: teamId, sprintId, createdBy.' });
    }
    // Auth check (assume req.user.id exists if authenticated)
    if (!req.user || req.user.id !== createdBy) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    const evaluation = await triggerSprintEvaluation({ teamId, sprintId, createdBy });
    res.status(202).json({
      evaluationId: evaluation.evaluationId,
      teamId: evaluation.teamId,
      sprintId: evaluation.sprintId,
      status: evaluation.status,
      createdAt: evaluation.createdAt
    });
>>>>>>> main
  } catch (err) {
    next(err);
  }
}

<<<<<<< Persist-evaluation-results
module.exports = {
  createOrUpdateSprintEvaluation,
  getSprintEvaluationResult
};
=======
module.exports = { triggerSprintEvaluationHandler };
>>>>>>> main
