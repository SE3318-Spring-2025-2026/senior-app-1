const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  ingestJiraIssuesValidation,
  ingestJiraIssues,
} = require('../controllers/jiraIssueIngestionController');

const router = express.Router();

router.post(
  '/issues',
  authenticateInternalApiKey,
  ingestJiraIssuesValidation,
  ingestJiraIssues,
);

module.exports = router;
