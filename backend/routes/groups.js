// Advisor release endpoint (only assigned advisor can release themselves)
router.patch(
	'/:groupId/advisor-release',
	authenticate,
	authorize(['PROFESSOR']),
	groupController.advisorReleaseValidation,
	groupController.advisorRelease
);

// Advisor assignment removal endpoint (admin/coordinator/system)
router.delete(
	'/group-database/groups/:groupId/advisor-assignment',
	authenticate,
	authorize(['ADMIN', 'COORDINATOR']),
	groupController.removeAdvisorAssignmentValidation,
	groupController.removeAdvisorAssignment
);
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


// PATCH /api/v1/groups/:groupId/advisor-release
router.patch('/:groupId/advisor-release', authenticate, groupController.releaseAdvisorFromGroup);

router.patch('/:groupId', authenticate, groupController.renameGroupValidation, groupController.renameGroup);


// Orphan group cleanup endpoint (admin/coordinator only)
router.delete(
	'/group-database/groups/:groupId',
	authenticate,
	authorize(['ADMIN', 'COORDINATOR']),
	groupController.deleteOrphanGroupValidation,
	groupController.deleteOrphanGroup
);
// Existing group delete (student leader)
router.delete('/:groupId', authenticate, groupController.deleteGroupValidation, groupController.deleteGroup);

// Remove advisor assignment from group (RBAC: ADMIN, COORDINATOR, current advisor)
router.delete(
	'/:groupId/advisor-assignment',
	authenticate,
	// Only ADMIN, COORDINATOR, or current advisor can remove advisor assignment
	(req, res, next) => {
		const allowedRoles = ['ADMIN', 'COORDINATOR'];
		if (allowedRoles.includes(req.user.role)) return next();
		// If user is the current advisor of the group, allow (ownership check in controller)
		return next();
	},
	groupController.removeAdvisorAssignmentValidation,
	groupController.removeAdvisorAssignment,
);

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
