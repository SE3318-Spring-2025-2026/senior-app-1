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
  } catch (err) {
    next(err);
  }
}

module.exports = { triggerSprintEvaluationHandler };
