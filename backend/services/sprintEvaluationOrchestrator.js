// Sprint Evaluation Orchestrator Service
// This is a placeholder for the orchestration logic that would call the aggregation, computation, and persistence layers.
// For now, it simulates async evaluation and returns an IN_PROGRESS status immediately.

const { v4: uuidv4 } = require('uuid');

let SprintEvaluation = null;
try {
  SprintEvaluation = require('../models/SprintEvaluation');
} catch (error) {
  if (!error || error.code !== 'MODULE_NOT_FOUND') {
    throw error;
  }
}

const fallbackEvaluations = new Map();

async function triggerSprintEvaluation({ teamId, sprintId, createdBy }) {
  if (!SprintEvaluation) {
    const key = `${teamId}:${sprintId}`;
    const existing = fallbackEvaluations.get(key);
    const evaluation = {
      evaluationId: existing?.evaluationId || uuidv4(),
      teamId,
      sprintId,
      status: 'IN_PROGRESS',
      createdBy,
      createdAt: new Date(),
      aggregatedScore: null,
      completionRate: null,
      gradingSummary: null,
    };
    fallbackEvaluations.set(key, evaluation);
    return evaluation;
  }

  // Check if an evaluation already exists for this team/sprint
  let evaluation = await SprintEvaluation.findOne({ teamId, sprintId });
  if (!evaluation) {
    evaluation = await SprintEvaluation.create({
      evaluationId: uuidv4(),
      teamId,
      sprintId,
      status: 'IN_PROGRESS',
      createdBy,
      createdAt: new Date(),
      aggregatedScore: null,
      completionRate: null,
      gradingSummary: null
    });
  } else {
    // If already exists, set to IN_PROGRESS and update createdBy/createdAt
    evaluation.status = 'IN_PROGRESS';
    evaluation.createdBy = createdBy;
    evaluation.createdAt = new Date();
    evaluation.aggregatedScore = null;
    evaluation.completionRate = null;
    evaluation.gradingSummary = null;
    await evaluation.save();
  }
  // In a real system, async job would be triggered here
  return evaluation;
}

module.exports = { triggerSprintEvaluation };
