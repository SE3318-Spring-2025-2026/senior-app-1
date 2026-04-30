const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const {
  createIntegrationBindingValidation,
  createIntegrationBinding,
} = require('../controllers/integrationBindingController');
const { getIntegrationConfiguration } = require('../controllers/integrationConfigurationController');
const {
  triggerJiraSyncValidation,
  triggerJiraSync,
} = require('../controllers/jiraSyncController');

const router = express.Router();

router.post(
  '/:teamId/integrations',
  authenticate,
  authorize(['STUDENT']),
  requireNonEmptyBody,
  createIntegrationBindingValidation,
  createIntegrationBinding,
);

router.get(
  '/:teamId/integrations',
  authenticate,
  authorize(['STUDENT']),
  getIntegrationConfiguration,
);

router.post(
  '/:teamId/sprints/:sprintId/jira-sync',
  authenticate,
  authorize(['STUDENT']),
  requireNonEmptyBody,
  triggerJiraSyncValidation,
  triggerJiraSync,
);

module.exports = router;
