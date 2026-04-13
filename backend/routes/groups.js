const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const groupController = require('../controllers/groupController');
const { updateGroupMembership } = require('../controllers/coordinatorController');

const router = express.Router();

/**
 * POST /api/v1/groups
 * Create a new group
 * Auth: Required (student who will be the leader)
 */
router.post('/', authenticate, groupController.createGroupValidation, groupController.createGroup);

router.get('/', authenticate, groupController.listGroups);
router.get('/joined', authenticate, groupController.listJoinedGroups);

router.get('/mine', authenticate, groupController.getMyGroup);

router.patch('/:groupId', authenticate, groupController.renameGroupValidation, groupController.renameGroup);

router.delete('/:groupId', authenticate, groupController.deleteGroupValidation, groupController.deleteGroup);

router.post('/:groupId/leave', authenticate, groupController.leaveGroupValidation, groupController.leaveGroup);
router.post('/:groupId/members/:memberId/kick', authenticate, groupController.kickMemberValidation, groupController.kickMember);

router.post('/:groupId/invitations', authenticate, groupController.dispatchInvitesValidation, groupController.dispatchInvites);

router.patch(
	'/:groupId/membership/coordinator',
	authenticate,
	authorize(['COORDINATOR']),
	updateGroupMembership,
);

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
