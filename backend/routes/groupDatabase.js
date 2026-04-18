const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  transferInGroupDatabase,
  removeAdvisorAssignment,
} = require('../controllers/mentorMatchingController');

const router = express.Router();

router.patch(
  '/groups/:groupId/advisor-transfer',
  authenticate,
  authorize(['COORDINATOR']),
  transferInGroupDatabase,
);
router.delete(
  '/groups/:groupId/advisor-assignment',
  authenticate,
  authorize(['COORDINATOR']),
  removeAdvisorAssignment,
);

module.exports = router;
