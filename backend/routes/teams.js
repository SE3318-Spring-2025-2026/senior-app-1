const express = require('express');
const githubVerificationController = require('../controllers/githubVerificationController');
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const {
  createIntegrationBindingValidation,
  createIntegrationBinding,
  updateIntegrationBinding,
} = require('../controllers/integrationBindingController');
const { getIntegrationConfiguration } = require('../controllers/integrationConfigurationController');
const {
  getSprintMonitoringSnapshotValidation,
  getSprintMonitoringSnapshot,
  getCurrentSprintMonitoringSnapshotValidation,
  getCurrentSprintMonitoringSnapshot,
} = require('../controllers/sprintMonitoringController');
const { triggerSprintEvaluationHandler } = require('../controllers/sprintEvaluationController');
const {
  triggerJiraSyncValidation,
  triggerJiraSync,
} = require('../controllers/jiraSyncController');
const aiFeatureController = require('../controllers/aiFeatureController');

const router = express.Router();

router.post(
  '/:teamId/integrations',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN']),
  requireNonEmptyBody,
  createIntegrationBindingValidation,
  createIntegrationBinding
);

router.put(
  '/:teamId/integrations',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN']),
  requireNonEmptyBody,
  createIntegrationBindingValidation,
  updateIntegrationBinding
);

router.get(
  '/:teamId/integrations',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN']),
  getIntegrationConfiguration
);

router.get(
  '/:teamId/sprints/:sprintId/monitoring',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN']),
  getSprintMonitoringSnapshotValidation,
  getSprintMonitoringSnapshot
);

router.get(
  '/:teamId/monitoring/current',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN']),
  getCurrentSprintMonitoringSnapshotValidation,
  getCurrentSprintMonitoringSnapshot
);

// Trigger sprint evaluation (no metrics in payload)
router.post(
  '/:teamId/sprints/:sprintId/evaluations',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN']),
  triggerSprintEvaluationHandler
);

/**
 * POST /api/v1/teams/:teamId/sprints/:sprintId/github-verifications
 * Triggers GitHub PR verification orchestration for a team and sprint.
 */
router.post(
  '/:teamId/sprints/:sprintId/github-verifications',
  authenticate,
  githubVerificationController.triggerGitHubVerificationValidation,
  githubVerificationController.triggerGitHubVerification
);

router.post(
  '/:teamId/sprints/:sprintId/jira-sync',
  authenticate,
  authorize(['STUDENT']),
  requireNonEmptyBody,
  triggerJiraSyncValidation,
  triggerJiraSync
);

// ─── AI: PR review verification ─────────────────────────────────────────────
router.post(
  '/:teamId/sprints/:sprintId/pr-review-verifications',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN', 'PROFESSOR']),
  aiFeatureController.verifyPrReviewsValidation,
  aiFeatureController.verifyPrReviews,
);

router.get(
  '/:teamId/sprints/:sprintId/pr-review-verifications',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN', 'PROFESSOR']),
  aiFeatureController.listPrReviewsValidation,
  aiFeatureController.listPrReviews,
);

// ─── AI: issue implementation validation (Business Flow 13) ─────────────────
router.post(
  '/:teamId/sprints/:sprintId/ai-validations',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN', 'PROFESSOR']),
  aiFeatureController.runValidationValidation,
  aiFeatureController.runValidation,
);

router.get(
  '/:teamId/sprints/:sprintId/ai-validations',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN', 'PROFESSOR']),
  aiFeatureController.listValidationsValidation,
  aiFeatureController.listValidations,
);

router.get(
  '/:teamId/sprints/:sprintId/ai-signals',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN', 'PROFESSOR']),
  aiFeatureController.getAiSignalsValidation,
  aiFeatureController.getAiSignals,
);

// Stored sprint stories (issue list) — no JIRA call required, reads from
// the SprintStory table. Used by the GitHub-AI grading page so the grader
// can see the issue descriptions side-by-side with the PRs.
router.get(
  '/:teamId/sprints/:sprintId/stories',
  authenticate,
  authorize(['STUDENT', 'COORDINATOR', 'ADMIN', 'PROFESSOR']),
  aiFeatureController.listStoriesValidation,
  aiFeatureController.listStories,
);

// AI-driven rubric criterion grading: PROFESSOR (acting as advisor or
// committee) clicks "Grade with AI" on a GITHUB_LLM criterion. Receives a
// suggested 0-100 score the professor can accept or override.
router.post(
  '/:teamId/sprints/:sprintId/grade-criterion-with-ai',
  authenticate,
  authorize(['PROFESSOR', 'COORDINATOR', 'ADMIN']),
  aiFeatureController.gradeCriterionValidation,
  aiFeatureController.gradeCriterionWithAi,
);

module.exports = router;
