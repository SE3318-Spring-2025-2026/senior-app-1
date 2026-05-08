/**
 * routes/submissions.js
 *
 * Committee submission endpoints: document retrieval (Issue #249) and grading (Issue #260).
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const submissionController = require('../controllers/submissionController');
const gradingController = require('../controllers/gradingController');

const router = express.Router();

router.get(
  '/',
  authenticate,
  submissionController.listSubmissions
);

router.get(
  '/:submissionId',
  authenticate,
  submissionController.getSubmissionValidation,
  submissionController.getSubmission
);

router.post(
  '/:submissionId/grade',
  authenticate,
  authorize(['PROFESSOR']),
  requireNonEmptyBody,
  gradingController.submitGradeValidation,
  gradingController.submitGrade
);

router.get(
  '/:submissionId/grades',
  authenticate,
  authorize(['PROFESSOR', 'COORDINATOR']),
  gradingController.listGradesValidation,
  gradingController.listGrades
);

module.exports = router;
