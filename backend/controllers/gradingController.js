/**
 * controllers/gradingController.js
 *
 * HTTP handlers for grading endpoints.
 * Implements grade submission with D6 logging (Issue #260).
 */

const { validationResult, body, param } = require('express-validator');
const GradingService = require('../services/gradingService');
const { v4: isUUID } = require('uuid');

/**
 * Validation middleware for POST /api/v1/committee/submissions/:submissionId/grade
 */
const submitGradeValidation = [
  param('submissionId')
    .custom((value) => isUUID(value))
    .withMessage('Submission ID must be a valid UUID'),
  body('gradeType')
    .isIn(['ADVISOR_SOFT', 'COMMITTEE_FINAL', 'PEER_REVIEW'])
    .withMessage('Grade type must be ADVISOR_SOFT, COMMITTEE_FINAL, or PEER_REVIEW'),
  body('scores')
    .isArray({ min: 1 })
    .withMessage('At least one score is required'),
  body('scores.*.criterionId')
    .notEmpty()
    .withMessage('Each score must have a criterionId'),
  body('scores.*.value')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Score value must be between 0 and 1'),
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Comments must be 2000 characters or less'),
];

/**
 * POST /api/v1/committee/submissions/:submissionId/grade
 *
 * Submit grades for a deliverable.
 * Logs the grading action to D6 (Audit Logs) asynchronously.
 *
 * Auth: PROFESSOR (committee member)
 *
 * Request body:
 * {
 *   gradeType: "ADVISOR_SOFT" | "COMMITTEE_FINAL" | "PEER_REVIEW",
 *   scores: [
 *     { criterionId: string, value: 0-1, note: optional string },
 *     ...
 *   ],
 *   comments: optional string
 * }
 *
 * Response: 201
 * {
 *   code: "SUCCESS",
 *   data: {
 *     id: UUID,
 *     deliverableId: UUID,
 *     gradedBy: UUID,
 *     gradeType: string,
 *     scores: [...],
 *     comments: string,
 *     finalScore: number,
 *     createdAt: ISO timestamp
 *   }
 * }
 */
async function submitGrade(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid grade data',
      errors: errors.array(),
    });
  }

  const { submissionId } = req.params;
  const { gradeType, scores, comments } = req.body;
  const reviewerId = req.user?.id;

  try {
    const grade = await GradingService.submitGrade({
      deliverableId: submissionId,
      gradedBy: reviewerId,
      scores,
      comments,
      gradeType,
    });

    // Calculate final score
    const finalScore =
      scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Grade submitted successfully',
      data: {
        id: grade.id,
        deliverableId: grade.deliverableId,
        gradedBy: grade.gradedBy,
        gradeType: grade.gradeType,
        scores: grade.scores,
        comments: grade.comments,
        finalScore: parseFloat(finalScore.toFixed(2)),
        createdAt: grade.createdAt,
      },
    });
  } catch (error) {
    if (
      error.code &&
      [
        'INVALID_DELIVERABLE_ID',
        'INVALID_GRADER_ID',
        'INVALID_GRADE_TYPE',
        'INVALID_SCORES',
        'INVALID_SCORE_FORMAT',
        'INVALID_SCORE_VALUE',
        'DELIVERABLE_NOT_FOUND',
      ].includes(error.code)
    ) {
      const statusCode = error.code === 'DELIVERABLE_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({
        code: error.code,
        message: error.message,
      });
    }

    console.error('Error submitting grade:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to submit grade',
    });
  }
}

/**
 * GET /api/v1/committee/submissions/:submissionId/grades
 *
 * List all grades for a deliverable.
 *
 * Auth: PROFESSOR, COORDINATOR
 *
 * Response: 200
 * {
 *   code: "SUCCESS",
 *   data: [
 *     { id, gradeType, finalScore, grader: {id, fullName}, createdAt },
 *     ...
 *   ]
 * }
 */
async function listGrades(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid submission ID',
      errors: errors.array(),
    });
  }

  const { submissionId } = req.params;

  try {
    const grades = await GradingService.listDeliverableGrades(submissionId);

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Grades retrieved successfully',
      data: grades.map((g) => {
        const finalScore =
          g.scores.reduce((sum, s) => sum + (s.value || 0), 0) / g.scores.length;
        return {
          id: g.id,
          gradeType: g.gradeType,
          finalScore: parseFloat(finalScore.toFixed(2)),
          grader: {
            id: g.grader?.id,
            fullName: g.grader?.fullName,
          },
          createdAt: g.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error('Error listing grades:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve grades',
    });
  }
}

module.exports = {
  submitGrade,
  listGrades,
  submitGradeValidation,
};
