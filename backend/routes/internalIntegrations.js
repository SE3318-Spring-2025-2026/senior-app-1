const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  storeIntegrationTokenValidation,
  storeIntegrationTokenReferences,
} = require('../controllers/integrationTokenController');

const router = express.Router();

router.post(
  '/tokens',
  authenticateInternalApiKey,
  storeIntegrationTokenValidation,
  storeIntegrationTokenReferences,
);

module.exports = router;
