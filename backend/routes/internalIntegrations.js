const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  storeIntegrationTokenValidation,
  storeIntegrationTokenReferences,
} = require('../controllers/integrationTokenController');
const {
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
} = require('../controllers/githubPrDataController');

const router = express.Router();

router.post(
  '/tokens',
  authenticateInternalApiKey,
  storeIntegrationTokenValidation,
  storeIntegrationTokenReferences,
);

router.post(
  '/github/pr-data',
  authenticateInternalApiKey,
  receiveGitHubPrDataValidation,
  receiveGitHubPrData,
);

module.exports = router;
