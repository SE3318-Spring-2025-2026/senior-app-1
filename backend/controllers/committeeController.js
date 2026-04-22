const { body, param, validationResult } = require('express-validator');
const committeeService = require('../services/committeeService');

exports.submitReviewValidation = [
  param('submissionId').isString().trim().notEmpty().withMessage('submissionId is required'),
  body('scores').isArray({ min: 1 }).withMessage('scores must be a non-empty array'),
  body('scores.*.criterionId').isString().trim().notEmpty().withMessage('Each score must have a valid criterionId'),
  body('scores.*.value').isFloat({ min: 0 }).withMessage('Each score value must be a non-negative number'),
  body('comments').optional({ nullable: true }).isString().withMessage('comments must be a string'),
];

exports.submitReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { submissionId } = req.params;
    const { scores, comments } = req.body;

    const review = await committeeService.submitReview({
      submissionId,
      reviewerId: req.user.id,
      scores,
      comments,
    });

    return res.status(201).json({
      id: review.id,
      submissionId: review.submissionId,
      reviewerId: review.reviewerId,
      scores: review.scores,
      comments: review.comments,
      finalScore: review.finalScore,
      createdAt: review.createdAt,
    });
  } catch (err) {
    if (err.code === 'SUBMISSION_NOT_FOUND') {
      return res.status(404).json({ code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' });
    }
    if (err.code === 'INVALID_CRITERION_ID') {
      return res.status(400).json({ code: 'INVALID_CRITERION_ID', message: err.message, details: err.details || [] });
    }
    console.error('[committeeController] submitReview error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};
