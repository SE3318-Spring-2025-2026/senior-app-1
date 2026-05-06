const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  createOrUpdateSprintEvaluation,
  getSprintEvaluationResult
} = require('../controllers/sprintEvaluationController');

// POST /teams/:teamId/sprints/:sprintId/evaluations
router.post('/teams/:teamId/sprints/:sprintId/evaluations', createOrUpdateSprintEvaluation);

// GET /teams/:teamId/sprints/:sprintId/evaluations
router.get('/teams/:teamId/sprints/:sprintId/evaluations', getSprintEvaluationResult);

module.exports = router;
