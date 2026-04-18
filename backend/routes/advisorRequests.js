const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  createAdvisorRequest,
  getAdvisorRequestsByGroup,
  getIncomingRequests,
  updateAdvisorRequestStatus,
  cancelAdvisorRequest,
} = require('../controllers/advisorRequestController');

const router = express.Router();

/**
 * POST /api/v1/advisor-requests
 * Team leader submits an advisor request
 */
router.post(
  '/',
  authenticate,
  authorize(['STUDENT']),
  ...createAdvisorRequest
);

/**
 * GET /api/v1/advisor-requests/group/:groupId
 * Get all advisor requests for a specific group
 */
router.get(
  '/group/:groupId',
  authenticate,
  ...getAdvisorRequestsByGroup
);

/**
 * GET /api/v1/advisor-requests/incoming
 * Get incoming advisor requests for a professor
 */
router.get(
  '/incoming',
  authenticate,
  authorize(['PROFESSOR']),
  ...getIncomingRequests
);

/**
 * PATCH /api/v1/advisor-requests/:requestId
 * Professor approves or rejects an advisor request
 */
router.patch(
  '/:requestId',
  authenticate,
  authorize(['PROFESSOR']),
  ...updateAdvisorRequestStatus
);

/**
 * DELETE /api/v1/advisor-requests/:requestId
 * Team leader cancels an advisor request
 */
router.delete(
  '/:requestId',
  authenticate,
  authorize(['STUDENT']),
  ...cancelAdvisorRequest
);

module.exports = router;
