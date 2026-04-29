const express = require('express');
const { authenticate } = require('../middleware/auth');
const githubVerificationController = require('../controllers/githubVerificationController');

const router = express.Router();

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

module.exports = router;
