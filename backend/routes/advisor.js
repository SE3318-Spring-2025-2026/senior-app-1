const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getAdvisorRequestDetails } = require('../controllers/advisorController');

// GET /api/v1/advisor-requests/:requestId
// Retrieve advisor request details
// Authorization: Only authenticated users (team leaders can view their own requests)
router.get(
  '/advisor-requests/:requestId',
  authenticate,
  authorize(['STUDENT']),
  getAdvisorRequestDetails
);

module.exports = router;
