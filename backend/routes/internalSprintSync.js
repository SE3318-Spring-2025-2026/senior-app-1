const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  storePrMetricsValidation,
  storePrMetrics,
} = require('../controllers/prMetricController');

const router = express.Router();

router.post(
  '/pr-metrics',
  authenticateInternalApiKey,
  storePrMetricsValidation,
  storePrMetrics,
);

module.exports = router;
