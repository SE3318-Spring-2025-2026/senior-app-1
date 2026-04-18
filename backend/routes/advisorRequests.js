const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getPendingAdvisorRequest } = require('../controllers/advisorRequestController');

const router = express.Router();

router.get(
  '/pending-advisor-requests/:requestId',
  authenticate,
  authorize(['PROFESSOR']),
  getPendingAdvisorRequest,
);

module.exports = router;
