const express = require('express');
const githubVerificationController = require('../controllers/githubVerificationController');
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

/**
 * POST /api/v1/teams/:teamId/sprints/:sprintId/github-verifications
 * Triggers GitHub PR verification orchestration for a team and sprint.
 */
router.post(
  '/:teamId/sprints/:sprintId/github-verifications',
  authenticate,
  githubVerificationController.triggerGitHubVerificationValidation,
  githubVerificationController.triggerGitHubVerification,
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
