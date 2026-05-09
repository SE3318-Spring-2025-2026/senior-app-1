const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const { getAggregatedEvaluationInput } = require('../controllers/evaluationAggregationController');
const aiFeatureController = require('../controllers/aiFeatureController');

const router = express.Router();

// GET /internal/evaluations/aggregate/:teamId/:sprintId
router.get('/aggregate/:teamId/:sprintId', getAggregatedEvaluationInput);

// Business Flow 14 — forward AI validation result to evaluation pipeline
router.post(
  '/validation-results',
  authenticateInternalApiKey,
  aiFeatureController.forwardValidationResults,
);

module.exports = router;
