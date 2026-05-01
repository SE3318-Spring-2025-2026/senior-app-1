const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
} = require('../controllers/githubPrDataIngestionController');

const router = express.Router();

router.post(
  '/pr-data',
  authenticateInternalApiKey,
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
);

module.exports = router;