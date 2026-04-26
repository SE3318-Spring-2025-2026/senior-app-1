const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const committeeController = require('../controllers/committeeController');

const router = express.Router();

router.post(
  '/submissions/:submissionId/review',
  authenticate,
  authorize(['PROFESSOR']),
  committeeController.submitReviewValidation,
  committeeController.submitReview,
);

module.exports = router;
