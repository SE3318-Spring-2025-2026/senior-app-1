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
const {
  triggerAiValidationValidation,
  triggerAiValidation,
  provideSprintHistoryValidation,
  provideSprintHistory,
  storeSprintEvaluationResultsValidation,
  storeSprintEvaluationResults,
} = require('../controllers/sprintMonitoringController');

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

router.post(
  '/:teamId/sprints/:sprintId/ai-validations',
  authenticate,
  authorize(['STUDENT']),
  requireNonEmptyBody,
  triggerAiValidationValidation,
  triggerAiValidation,
);

router.get(
  '/:teamId/sprints/:sprintId/history',
  authenticate,
  authorize(['STUDENT']),
  provideSprintHistoryValidation,
  provideSprintHistory,
);

router.post(
  '/:teamId/sprints/:sprintId/evaluations',
  authenticate,
  authorize(['STUDENT']),
  requireNonEmptyBody,
  storeSprintEvaluationResultsValidation,
  storeSprintEvaluationResults,
);

router.get(
  '/:teamId/integrations/config',
  authenticate,
  authorize(['STUDENT']),
  getIntegrationConfiguration,
);

module.exports = router;
