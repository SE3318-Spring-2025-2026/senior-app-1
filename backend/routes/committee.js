const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const committeeController = require('../controllers/committeeController');

const router = express.Router();

router.get(
  '/rubric-criteria',
  authenticate,
  authorize(['PROFESSOR']),
  committeeController.listRubricCriteria,
);

router.get(
  '/submissions/pending',
  authenticate,
  authorize(['PROFESSOR']),
  committeeController.listPendingSubmissions,
);

router.post(
  '/submissions/:submissionId/grade',
  authenticate,
  authorize(['PROFESSOR']),
  committeeController.submitReviewValidation,
  committeeController.submitReview,
);

module.exports = router;
