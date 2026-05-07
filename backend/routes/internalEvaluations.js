const express = require('express');
const { getAggregatedEvaluationInput } = require('../controllers/evaluationAggregationController');

const router = express.Router();

// GET /internal/evaluations/aggregate/:teamId/:sprintId
router.get('/aggregate/:teamId/:sprintId', getAggregatedEvaluationInput);

module.exports = router;
