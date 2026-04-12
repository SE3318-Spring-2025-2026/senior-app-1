const express = require('express');
const { authenticate } = require('../middleware/auth');
const groupController = require('../controllers/groupController');

const router = express.Router();

/**
 * POST /api/v1/groups
 * Create a new group
 * Auth: Required (student who will be the leader)
 */
router.post('/', authenticate, groupController.createGroupValidation, groupController.createGroup);

/**
 * POST /api/v1/groups/:groupId/membership/finalize
 * Finalize membership for a student in a group
 * Auth: Optional (for leader reference)
 */
router.post('/:groupId/membership/finalize', groupController.finalizeMembershipValidation, groupController.finalizeMembership);

/**
 * GET /api/v1/groups/:groupId/membership
 * Get group membership details
 * Auth: Optional
 */
router.get('/:groupId/membership', groupController.getGroupMembershipValidation, groupController.getGroupMembership);

module.exports = router;
