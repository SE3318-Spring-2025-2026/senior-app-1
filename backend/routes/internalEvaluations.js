const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  forwardPrDataForEvaluationValidation,
  forwardPrDataForEvaluation,
  forwardStoryDataForEvaluationValidation,
  forwardStoryDataForEvaluation,
  returnValidationResultsForEvaluationValidation,
  returnValidationResultsForEvaluation,
} = require('../controllers/sprintMonitoringController');

const router = express.Router();

router.post(
  '/pr-data',
  authenticateInternalApiKey,
  forwardPrDataForEvaluationValidation,
  forwardPrDataForEvaluation,
);

router.post(
  '/story-data',
  authenticateInternalApiKey,
  forwardStoryDataForEvaluationValidation,
  forwardStoryDataForEvaluation,
);

router.post(
  '/validation-results',
  authenticateInternalApiKey,
  returnValidationResultsForEvaluationValidation,
  returnValidationResultsForEvaluation,
);

module.exports = router;