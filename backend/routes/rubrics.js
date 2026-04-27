/**
 * routes/rubrics.js
 *
 * Coordinator rubric management endpoints.
 * Implements rubric creation with D6 logging (Issue #255).
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const rubricController = require('../controllers/rubricController');

const router = express.Router();

/**
 * POST /api/v1/coordinator/rubrics
 * Create a new grading rubric
 *
 * Auth: COORDINATOR only
 */
router.post(
  '/',
  authenticate,
  authorize(['COORDINATOR']),
  rubricController.createRubricValidation,
  rubricController.createRubric
);

/**
 * GET /api/v1/coordinator/rubrics
 * List all rubrics
 *
 * Auth: COORDINATOR only
 */
router.get(
  '/',
  authenticate,
  authorize(['COORDINATOR']),
  rubricController.listRubrics
);

module.exports = router;
