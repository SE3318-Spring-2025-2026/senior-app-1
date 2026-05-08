const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  storePrMetricsValidation,
  storePrMetrics,
} = require('../controllers/prMetricController');
const {
  storeStoryMetricsValidation,
  storeStoryMetrics,
} = require('../controllers/storyMetricController');
const {
  storeAiValidationResultValidation,
  storeAiValidationResult,
  storeSprintEvaluationMetricsValidation,
  storeSprintEvaluationMetrics,
} = require('../controllers/sprintMonitoringController');

const router = express.Router();

router.post(
  '/pr-metrics',
  authenticateInternalApiKey,
  storePrMetricsValidation,
  storePrMetrics,
);

router.post(
  '/stories',
  authenticateInternalApiKey,
  storeStoryMetricsValidation,
  storeStoryMetrics,
);

router.post(
  '/ai-validations',
  authenticateInternalApiKey,
  storeAiValidationResultValidation,
  storeAiValidationResult,
);

router.post(
  '/evaluation-metrics',
  authenticateInternalApiKey,
  storeSprintEvaluationMetricsValidation,
  storeSprintEvaluationMetrics,
);

module.exports = router;
