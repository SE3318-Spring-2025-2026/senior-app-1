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

module.exports = router;
