const express = require('express');
const router = express.Router();
const { patchDecision, listAdvisorRequests } = require('../controllers/advisorRequestController');
// GET /api/v1/advisor-requests?status=PENDING
router.get('/advisor-requests', auth, listAdvisorRequests);
const auth = require('../middleware/auth');

// PATCH /api/v1/advisor-requests/:requestId/decision
router.patch('/advisor-requests/:requestId/decision', auth, patchDecision);

module.exports = router;
