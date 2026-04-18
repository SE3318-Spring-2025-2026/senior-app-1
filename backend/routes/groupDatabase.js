const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  deleteOrphanGroup,
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
  authorize(['ADMIN', 'COORDINATOR']),
  removeAdvisorAssignment,
);
router.delete(
  '/groups/:groupId',
  authenticate,
  authorize(['ADMIN', 'COORDINATOR']),
  deleteOrphanGroup,
);

module.exports = router;
