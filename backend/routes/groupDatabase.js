const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
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
  requireNonEmptyBody,
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
