const { body, param, validationResult } = require('express-validator');

function validationFailed(res, errors, code = 'VALIDATION_ERROR', status = 400) {
  return res.status(status).json({
    code,
    message: 'Request validation failed.',
    details: errors.array(),
  });
}

function actionResponse({
  id,
  status,
  message,
  data,
}, resStatus = 202) {
  return {
    statusCode: resStatus,
    payload: {
      id,
      status,
      message,
      recordedAt: new Date().toISOString(),
      ...(data ? { data } : {}),
    },
  };
}

const teamSprintParamValidation = [
  param('teamId').trim().notEmpty().withMessage('teamId is required'),
  param('sprintId').trim().notEmpty().withMessage('sprintId is required'),
];

const triggerAiValidationValidation = [
  ...teamSprintParamValidation,
  body('requestedBy').trim().notEmpty().withMessage('requestedBy is required'),
  body('issueSet').isArray({ min: 1 }).withMessage('issueSet must be a non-empty array'),
];

async function triggerAiValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `ai_val_${Date.now()}`,
      status: 'ACCEPTED',
      message: 'AI validation request accepted.',
    },
    202,
  );

  return res.status(response.statusCode).json(response.payload);
}

const provideSprintHistoryValidation = [...teamSprintParamValidation];

async function provideSprintHistory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  return res.status(200).json({
    teamId: req.params.teamId,
    sprintId: req.params.sprintId,
    storyMetrics: [],
    prMetrics: [],
    aiValidations: [],
    generatedAt: new Date().toISOString(),
  });
}

const storeSprintEvaluationResultsValidation = [
  ...teamSprintParamValidation,
  body('requestedBy').trim().notEmpty().withMessage('requestedBy is required'),
];

async function storeSprintEvaluationResults(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `eval_res_${Date.now()}`,
      status: 'STORED',
      message: 'Sprint evaluation results stored successfully.',
    },
    201,
  );

  return res.status(response.statusCode).json(response.payload);
}

const forwardPrDataForEvaluationValidation = [
  body('teamId').trim().notEmpty().withMessage('teamId is required'),
  body('sprintId').trim().notEmpty().withMessage('sprintId is required'),
  body('receivedAt').isISO8601().withMessage('receivedAt must be a valid ISO8601 datetime'),
  body('pullRequests').isArray({ min: 1 }).withMessage('pullRequests must be a non-empty array'),
];

async function forwardPrDataForEvaluation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `eval_pr_${Date.now()}`,
      status: 'ACCEPTED',
      message: 'PR data forwarded for evaluation.',
    },
    202,
  );

  return res.status(response.statusCode).json(response.payload);
}

const forwardStoryDataForEvaluationValidation = [
  body('teamId').trim().notEmpty().withMessage('teamId is required'),
  body('sprintId').trim().notEmpty().withMessage('sprintId is required'),
  body('receivedAt').isISO8601().withMessage('receivedAt must be a valid ISO8601 datetime'),
  body('issues').isArray({ min: 1 }).withMessage('issues must be a non-empty array'),
];

async function forwardStoryDataForEvaluation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `eval_story_${Date.now()}`,
      status: 'ACCEPTED',
      message: 'Story data forwarded for evaluation.',
    },
    202,
  );

  return res.status(response.statusCode).json(response.payload);
}

const returnValidationResultsForEvaluationValidation = [
  body('teamId').trim().notEmpty().withMessage('teamId is required'),
  body('sprintId').trim().notEmpty().withMessage('sprintId is required'),
  body('results').isArray({ min: 1 }).withMessage('results must be a non-empty array'),
  body('receivedAt').isISO8601().withMessage('receivedAt must be a valid ISO8601 datetime'),
];

async function returnValidationResultsForEvaluation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `eval_ai_${Date.now()}`,
      status: 'ACCEPTED',
      message: 'AI validation results received for evaluation.',
    },
    202,
  );

  return res.status(response.statusCode).json(response.payload);
}

const storeAiValidationResultValidation = [
  body('teamId').trim().notEmpty().withMessage('teamId is required'),
  body('sprintId').trim().notEmpty().withMessage('sprintId is required'),
  body('results').isArray({ min: 1 }).withMessage('results must be a non-empty array'),
  body('receivedAt').isISO8601().withMessage('receivedAt must be a valid ISO8601 datetime'),
];

async function storeAiValidationResult(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `sync_ai_${Date.now()}`,
      status: 'STORED',
      message: 'AI validation metrics stored successfully.',
    },
    201,
  );

  return res.status(response.statusCode).json(response.payload);
}

const storeSprintEvaluationMetricsValidation = [
  body('teamId').trim().notEmpty().withMessage('teamId is required'),
  body('sprintId').trim().notEmpty().withMessage('sprintId is required'),
  body('metrics').isArray({ min: 1 }).withMessage('metrics must be a non-empty array'),
  body('computedAt').isISO8601().withMessage('computedAt must be a valid ISO8601 datetime'),
];

async function storeSprintEvaluationMetrics(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `sync_eval_${Date.now()}`,
      status: 'STORED',
      message: 'Sprint evaluation metrics stored successfully.',
    },
    201,
  );

  return res.status(response.statusCode).json(response.payload);
}

const logIntegrationActivityValidation = [
  body('eventType').trim().notEmpty().withMessage('eventType is required'),
  body('actorId').trim().notEmpty().withMessage('actorId is required'),
  body('actorType').trim().notEmpty().withMessage('actorType is required'),
];

async function logIntegrationActivity(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `audit_int_${Date.now()}`,
      status: 'RECORDED',
      message: 'Integration activity log recorded.',
    },
    201,
  );

  return res.status(response.statusCode).json(response.payload);
}

const logSyncAndEvaluationEventsValidation = [
  body('eventType').trim().notEmpty().withMessage('eventType is required'),
  body('actorId').trim().notEmpty().withMessage('actorId is required'),
  body('actorType').trim().notEmpty().withMessage('actorType is required'),
];

async function logSyncAndEvaluationEvents(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors);
  }

  const response = actionResponse(
    {
      id: `audit_eval_${Date.now()}`,
      status: 'RECORDED',
      message: 'Sync/evaluation event log recorded.',
    },
    201,
  );

  return res.status(response.statusCode).json(response.payload);
}

module.exports = {
  triggerAiValidationValidation,
  triggerAiValidation,
  provideSprintHistoryValidation,
  provideSprintHistory,
  storeSprintEvaluationResultsValidation,
  storeSprintEvaluationResults,
  forwardPrDataForEvaluationValidation,
  forwardPrDataForEvaluation,
  forwardStoryDataForEvaluationValidation,
  forwardStoryDataForEvaluation,
  returnValidationResultsForEvaluationValidation,
  returnValidationResultsForEvaluation,
  storeAiValidationResultValidation,
  storeAiValidationResult,
  storeSprintEvaluationMetricsValidation,
  storeSprintEvaluationMetrics,
  logIntegrationActivityValidation,
  logIntegrationActivity,
  logSyncAndEvaluationEventsValidation,
  logSyncAndEvaluationEvents,
};