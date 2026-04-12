const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { coordinatorLogin } = require('../controllers/adminController');
const { importValidStudentIds } = require('../controllers/userDatabaseController');
const { updateGroupMembership } = require('../controllers/coordinatorController');

const router = express.Router();

router.post('/login', coordinatorLogin);
router.post(
  '/student-id-registry/import',
  authenticate,
  authorize(['COORDINATOR']),
  importValidStudentIds,
);
router.patch('/groups/:groupId/members', authenticate, authorize(['COORDINATOR']), updateGroupMembership);

module.exports = router;
