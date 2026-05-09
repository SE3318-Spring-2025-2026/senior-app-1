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
const aiFeatureController = require('../controllers/aiFeatureController');

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

// Business Flow 15 — store AI validation results
router.post(
  '/ai-validations',
  authenticateInternalApiKey,
  aiFeatureController.storeValidationsValidation,
  aiFeatureController.storeValidations,
);

module.exports = router;
