const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { coordinatorLogin } = require('../controllers/adminController');
const { importValidStudentIds } = require('../controllers/userDatabaseController');
const { updateGroupMembership } = require('../controllers/coordinatorController');
const {
  listCoordinatorAdvisors,
  transferByCoordinator,
} = require('../controllers/mentorMatchingController');
const groupController = require('../controllers/groupController');

const router = express.Router();

router.post('/login', coordinatorLogin);
router.post(
  '/student-id-registry/import',
  authenticate,
  authorize(['COORDINATOR']),
  importValidStudentIds,
);
router.get('/advisors', authenticate, authorize(['COORDINATOR']), listCoordinatorAdvisors);
router.get('/groups', authenticate, authorize(['COORDINATOR']), groupController.listGroups);
router.patch('/groups/:groupId/advisor-transfer', authenticate, authorize(['COORDINATOR']), transferByCoordinator);
router.patch('/groups/:groupId/members', authenticate, authorize(['COORDINATOR']), updateGroupMembership);
router.patch('/groups/:groupId/membership/coordinator', authenticate, authorize(['COORDINATOR']), updateGroupMembership);

module.exports = router;
