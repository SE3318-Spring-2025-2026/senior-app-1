'use strict';

const { param, body, validationResult } = require('express-validator');
const aiFeatureService = require('../services/aiFeatureService');
const aiService = require('../services/aiService');

function fail400(res, errors) {
  return res.status(400).json({
    code: 'VALIDATION_ERROR',
    message: 'Invalid request',
    errors: errors.array(),
  });
}

const teamSprintParams = [
  param('teamId').isString().trim().notEmpty().withMessage('teamId is required'),
  param('sprintId').isString().trim().notEmpty().withMessage('sprintId is required'),
];

// ─── PR review verification ──────────────────────────────────────────────────

exports.verifyPrReviewsValidation = [...teamSprintParams];

exports.verifyPrReviews = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);

  try {
    const summary = await aiFeatureService.verifyPrReviewsForSprint({
      teamId: req.params.teamId,
      sprintId: req.params.sprintId,
      actorId: req.user?.id || null,
    });
    return res.status(202).json({
      code: 'ACCEPTED',
      message: 'PR review verification triggered',
      data: {
        ...summary,
        aiAvailable: aiService.isAvailable(),
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.listPrReviewsValidation = [...teamSprintParams];

exports.listPrReviews = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);

  try {
    const data = await aiFeatureService.listPrReviewStatuses({
      teamId: req.params.teamId,
      sprintId: req.params.sprintId,
    });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'PR review statuses retrieved',
      data: {
        teamId: req.params.teamId,
        sprintId: req.params.sprintId,
        pullRequests: data,
        aiAvailable: aiService.isAvailable(),
      },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── AI implementation validation (Business Flow 13) ─────────────────────────

exports.runValidationValidation = [
  ...teamSprintParams,
  body('issueKey').isString().trim().notEmpty().withMessage('issueKey is required'),
  body('issueDescription').isString().trim().notEmpty().withMessage('issueDescription is required'),
  body('fileDiffs').isArray({ min: 1 }).withMessage('fileDiffs must be a non-empty array'),
  body('fileDiffs.*.path').isString().trim().notEmpty().withMessage('each diff requires path'),
  body('fileDiffs.*.diff').isString().withMessage('each diff requires diff string'),
  body('prNumber').optional().isInt({ min: 1 }),
];

exports.runValidation = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);

  try {
    const row = await aiFeatureService.runImplementationValidation({
      teamId: req.params.teamId,
      sprintId: req.params.sprintId,
      issueKey: req.body.issueKey,
      issueDescription: req.body.issueDescription,
      fileDiffs: req.body.fileDiffs,
      prNumber: req.body.prNumber || null,
      actorId: req.user?.id || null,
    });
    return res.status(202).json({
      code: 'ACCEPTED',
      message: 'AI validation completed and stored',
      data: {
        validationId: row.id,
        teamId: row.teamId,
        sprintId: row.sprintId,
        issueKey: row.issueKey,
        validationStatus: row.validationStatus,
        confidence: row.confidence,
        feedback: row.feedback,
        validatedAt: row.validatedAt,
        aiAvailable: aiService.isAvailable(),
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.listValidationsValidation = [...teamSprintParams];

exports.listValidations = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);

  try {
    const rows = await aiFeatureService.listValidationsForSprint({
      teamId: req.params.teamId,
      sprintId: req.params.sprintId,
    });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'AI validations retrieved',
      data: {
        teamId: req.params.teamId,
        sprintId: req.params.sprintId,
        validations: rows.map((row) => ({
          validationId: row.id,
          issueKey: row.issueKey,
          prNumber: row.prNumber,
          validationStatus: row.validationStatus,
          confidence: row.confidence,
          feedback: row.feedback,
          validatedAt: row.validatedAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.listStoriesValidation = [...teamSprintParams];

exports.listStories = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);
  try {
    const stories = await aiFeatureService.listStoriesForSprint({
      teamId: req.params.teamId,
      sprintId: req.params.sprintId,
    });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Sprint stories retrieved',
      data: { teamId: req.params.teamId, sprintId: req.params.sprintId, stories },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── AI signal aggregation for grading (Team Evaluation input) ──────────────

exports.getAiSignalsValidation = [...teamSprintParams];

exports.getAiSignals = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);
  try {
    const data = await aiFeatureService.aggregateAiSignalsForSprint({
      teamId: req.params.teamId,
      sprintId: req.params.sprintId,
    });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'AI signals aggregated',
      data,
    });
  } catch (err) {
    return next(err);
  }
};

// ─── AI-driven rubric criterion grading (GITHUB_LLM type) ───────────────────

exports.gradeCriterionValidation = [
  ...teamSprintParams,
  body('criterion').isObject().withMessage('criterion is required'),
  body('criterion.question').isString().trim().notEmpty().withMessage('criterion.question is required'),
  body('criterion.maxPoints').optional().isFloat({ min: 0 }),
];

exports.gradeCriterionWithAi = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);
  try {
    const result = await aiFeatureService.gradeCriterionFromTeamGithub({
      teamId: req.params.teamId,
      sprintId: req.params.sprintId,
      criterion: req.body.criterion,
    });
    return res.status(200).json({
      code: 'SUCCESS',
      message: 'AI grading suggestion ready',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

// ─── Internal: Business Flow 14 — forward results to evaluation pipeline ────
// Lightweight ack endpoint — the evaluation pipeline writes via its own
// aggregator; this just records that a forward happened.

exports.forwardValidationResults = async (req, res) => {
  const { teamId, sprintId, result } = req.body || {};
  if (!teamId || !sprintId || !result || !result.issueKey || !result.validationStatus) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'teamId, sprintId, and result.{issueKey,validationStatus} are required',
    });
  }
  return res.status(201).json({
    code: 'ACCEPTED',
    message: 'Validation result forwarded to evaluation pipeline',
    data: { teamId, sprintId, issueKey: result.issueKey, status: 'ACCEPTED' },
  });
};

// ─── Internal: Business Flow 15 — store batch ────────────────────────────────

exports.storeValidationsValidation = [
  body('teamId').isString().trim().notEmpty().withMessage('teamId is required'),
  body('sprintId').isString().trim().notEmpty().withMessage('sprintId is required'),
  body('validations').isArray({ min: 1 }).withMessage('validations must be a non-empty array'),
  body('validations.*.issueKey').isString().trim().notEmpty(),
  body('validations.*.validationStatus')
    .isIn(['MATCHED', 'PARTIAL_MATCH', 'NOT_MATCHED', 'AI_UNAVAILABLE', 'AI_ERROR', 'AI_PARSE_ERROR']),
];

exports.storeValidations = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail400(res, errors);
  try {
    const result = await aiFeatureService.storeValidationsBatch({
      teamId: req.body.teamId,
      sprintId: req.body.sprintId,
      validations: req.body.validations,
    });
    return res.status(201).json({
      code: 'SUCCESS',
      message: 'AI validations stored',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};
