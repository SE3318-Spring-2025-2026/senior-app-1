const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createAdvisorRequest,
  getAdvisorRequests,
  getAdvisorRequestById,
  updateAdvisorRequestStatus,
} = require('../controllers/advisorRequestController');

const router = express.Router();

router.post('/advisor-requests', authenticate, createAdvisorRequest);
router.get('/advisor-requests', authenticate, getAdvisorRequests);
router.get('/advisor-requests/:id', authenticate, getAdvisorRequestById);
router.patch('/advisor-requests/:id', authenticate, updateAdvisorRequestStatus);

module.exports = router;
const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createAdvisorRequest,
  getAdvisorRequests,
  getAdvisorRequestById,
  updateAdvisorRequestStatus,
} = require('../controllers/advisorRequestController');

const router = express.Router();

router.post('/advisor-requests', authenticate, createAdvisorRequest);
router.get('/advisor-requests', authenticate, getAdvisorRequests);
router.get('/advisor-requests/:id', authenticate, getAdvisorRequestById);
router.patch('/advisor-requests/:id', authenticate, updateAdvisorRequestStatus);

module.exports = router;
