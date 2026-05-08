const express = require('express');
const { authenticateInternalApiKey } = require('../middleware/internalApiKey');
const {
  forwardPrDataForEvaluationValidation,
  forwardPrDataForEvaluation,
  forwardStoryDataForEvaluationValidation,
  forwardStoryDataForEvaluation,
  returnValidationResultsForEvaluationValidation,
  returnValidationResultsForEvaluation,
} = require('../controllers/sprintMonitoringFlowController');
const { getAggregatedEvaluationInput } = require('../controllers/evaluationAggregationController');

const router = express.Router();

// GET /internal/evaluations/aggregate/:teamId/:sprintId
router.get('/aggregate/:teamId/:sprintId', getAggregatedEvaluationInput);

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
