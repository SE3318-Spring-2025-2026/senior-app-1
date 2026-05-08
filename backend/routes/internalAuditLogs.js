const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  logIntegrationActivityValidation,
  logIntegrationActivity,
  logSyncAndEvaluationEventsValidation,
  logSyncAndEvaluationEvents,
} = require('../controllers/sprintMonitoringFlowController');

const router = express.Router();

router.post(
  '/integrations',
  authenticateInternalApiKey,
  logIntegrationActivityValidation,
  logIntegrationActivity,
);

router.post(
  '/evaluations',
  authenticateInternalApiKey,
  logSyncAndEvaluationEventsValidation,
  logSyncAndEvaluationEvents,
);

module.exports = router;