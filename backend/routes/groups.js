const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');

/**
 * POST /api/v1/groups
 * Create a new group
 */
router.post('/', groupController.createGroupValidation, groupController.createGroup);

/**
 * GET /api/v1/groups/:groupId/membership
 * Get group membership details
 */
router.get('/:groupId/membership', groupController.getGroupMembershipValidation, groupController.getGroupMembership);

/**
 * POST /api/v1/groups/:groupId/membership/finalize
 * Finalize membership for a student (issue 11 - Group Membership Write)
 */
router.post('/:groupId/membership/finalize', groupController.finalizeMembershipValidation, groupController.finalizeMembership);

module.exports = router;
