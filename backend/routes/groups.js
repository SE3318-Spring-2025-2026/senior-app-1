const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const groupController = require('../controllers/groupController');

const router = express.Router();

/**
 * PATCH /api/v1/groups/:groupId/membership/coordinator — coordinator manual override (P25 / f19)
 */
router.patch(
  '/:groupId/membership/coordinator',
  authenticate,
  authorize(['COORDINATOR']),
  groupController.patchCoordinatorMembership,
);

/**
 * POST /api/v1/groups
 */
router.post('/', authenticate, groupController.createGroupValidation, groupController.createGroup);

/**
 * POST /api/v1/groups/:groupId/membership/finalize
 */
router.post(
  '/:groupId/membership/finalize',
  groupController.finalizeMembershipValidation,
  groupController.finalizeMembership,
);

/**
 * GET /api/v1/groups/:groupId/membership
 */
router.get(
  '/:groupId/membership',
  groupController.getGroupMembershipValidation,
  groupController.getGroupMembership,
);

module.exports = router;
