const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const groupController = require('../controllers/groupController');
const { updateGroupMembership } = require('../controllers/coordinatorController');
const submissionController = require('../controllers/submissionController');

const router = express.Router();

/**
 * POST /api/v1/groups
 * Create a new group
 * Auth: Required (student who will be the leader)
 */
router.post('/', authenticate, requireNonEmptyBody, groupController.createGroupValidation, groupController.createGroup);

router.get('/', authenticate, groupController.listGroups);
router.get('/joined', authenticate, groupController.listJoinedGroups);

router.get('/mine', authenticate, groupController.getMyGroup);

router.patch(
  '/:groupId/advisor-release',
  authenticate,
  authorize(['PROFESSOR']),
  groupController.advisorReleaseValidation,
  groupController.advisorRelease,
);

router.patch('/:groupId', authenticate, requireNonEmptyBody, groupController.renameGroupValidation, groupController.renameGroup);
router.delete('/:groupId', authenticate, groupController.deleteGroupValidation, groupController.deleteGroup);

router.delete(
  '/:groupId/advisor-assignment',
  authenticate,
  groupController.removeAdvisorAssignmentValidation,
  groupController.removeAdvisorAssignment,
);

router.post('/:groupId/leave', authenticate, groupController.leaveGroupValidation, groupController.leaveGroup);
router.post('/:groupId/members/:memberId/kick', authenticate, groupController.kickMemberValidation, groupController.kickMember);

router.post('/:groupId/invitations', authenticate, requireNonEmptyBody, groupController.dispatchInvitesValidation, groupController.dispatchInvites);

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
router.post('/:groupId/membership/finalize', requireNonEmptyBody, groupController.finalizeMembershipValidation, groupController.finalizeMembership);

/**
 * GET /api/v1/groups/:groupId/membership
 * Get group membership details
 * Auth: Optional
 */
router.get('/:groupId/membership', groupController.getGroupMembershipValidation, groupController.getGroupMembership);

/**
 * POST /api/v1/groups/:groupId/deliverables
 * Submit a deliverable (Proposal or SOW)
 * Auth: STUDENT (group member)
 */
router.post(
  '/:groupId/deliverables',
  authenticate,
  authorize(['STUDENT']),
  requireNonEmptyBody,
  submissionController.submitDeliverableValidation,
  submissionController.submitDeliverable
);

/**
 * GET /api/v1/groups/:groupId/deliverables
 * List deliverables for a group
 * Auth: STUDENT, PROFESSOR, COORDINATOR
 */
router.get(
  '/:groupId/deliverables',
  authenticate,
  authorize(['STUDENT', 'PROFESSOR', 'COORDINATOR']),
  submissionController.listDeliverableValidation,
  submissionController.listDeliverables
);

module.exports = router;
