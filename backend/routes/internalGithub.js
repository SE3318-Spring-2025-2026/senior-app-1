const express = require('express');
const {
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
} = require('../controllers/githubPrDataIngestionController');

const router = express.Router();

// POST /api/v1/internal/github/pr-data - Accept batch GitHub PR data for sprint monitoring.
// Validates, normalizes, and logs PR metadata (prNumber, branchName, issueKey, diffSummary, etc.)
router.post(
  '/github/pr-data',
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
);

module.exports = router;