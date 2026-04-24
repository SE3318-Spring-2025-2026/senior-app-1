/**
 * routes/submissions.js
 *
 * Committee submission review and grading endpoints.
 * Implements grading with D6 logging (Issue #260).
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const gradingController = require('../controllers/gradingController');

const router = express.Router();

/**
 * POST /api/v1/committee/submissions/:submissionId/grade
 * Submit grades for a deliverable
 *
 * Auth: PROFESSOR (committee member)
 */
router.post(
  '/:submissionId/grade',
  authenticate,
  authorize(['PROFESSOR']),
  gradingController.submitGradeValidation,
  gradingController.submitGrade
);

/**
 * GET /api/v1/committee/submissions/:submissionId/grades
 * List all grades for a deliverable
 *
 * Auth: PROFESSOR, COORDINATOR
 */
router.get(
  '/:submissionId/grades',
  authenticate,
  authorize(['PROFESSOR', 'COORDINATOR']),
  gradingController.submitGradeValidation,
  gradingController.listGrades
);

module.exports = router;
