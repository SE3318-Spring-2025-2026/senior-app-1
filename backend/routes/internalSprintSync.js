const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  storeStoryMetricsValidation,
  storeStoryMetrics,
} = require('../controllers/storyMetricController');

const router = express.Router();

router.post(
  '/stories',
  authenticateInternalApiKey,
  storeStoryMetricsValidation,
  storeStoryMetrics,
);

module.exports = router;
