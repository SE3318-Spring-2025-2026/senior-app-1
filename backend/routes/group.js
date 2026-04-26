const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const groupController = require('../controllers/groupController');
const { updateGroupMembership } = require('../controllers/coordinatorController');
const { submitDeliverableValidation, submitDeliverable } = require('../controllers/groupDeliverableController');

const router = express.Router();

router.post('/', authenticate, groupController.createGroupValidation, groupController.createGroup);
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
router.patch('/:groupId', authenticate, groupController.renameGroupValidation, groupController.renameGroup);
router.delete('/:groupId', authenticate, groupController.deleteGroupValidation, groupController.deleteGroup);
router.delete(
  '/:groupId/advisor-assignment',
  authenticate,
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

router.post('/:groupId/membership/finalize', groupController.finalizeMembershipValidation, groupController.finalizeMembership);
router.get('/:groupId/membership', groupController.getGroupMembershipValidation, groupController.getGroupMembership);

// POST /api/v1/groups/:groupId/deliverables
router.post(
  '/:groupId/deliverables',
  authenticate,
  authorize(['STUDENT', 'PROFESSOR', 'COORDINATOR']),
  submitDeliverableValidation,
  submitDeliverable,
);

module.exports = router;