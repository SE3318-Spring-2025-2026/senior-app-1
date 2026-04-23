/**
 * routes/submissions.js
 *
 * Committee submission endpoints for document retrieval and review.
 * Implements D5 Document Retrieval (Issue #249, Connector f9).
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const submissionController = require('../controllers/submissionController');

const router = express.Router();

/**
 * GET /api/v1/committee/submissions
 * List all submissions accessible to current user
 *
 * Auth: ADMIN, COORDINATOR, PROFESSOR, STUDENT
 */
router.get(
  '/',
  authenticate,
  submissionController.listSubmissions
);

/**
 * GET /api/v1/committee/submissions/:submissionId
 * Fetch submission with document content, rubric, and grading history
 *
 * Auth: ADMIN, COORDINATOR, PROFESSOR, or STUDENT (own group only)
 * Returns: SubmissionReviewPacket
 */
router.get(
  '/:submissionId',
  authenticate,
  submissionController.getSubmissionValidation,
  submissionController.getSubmission
);

module.exports = router;
