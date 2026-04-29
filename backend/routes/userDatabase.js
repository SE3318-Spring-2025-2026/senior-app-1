const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const {
  createProfessorRecord,
  createStudentRecord,
  importValidStudentIds,
  updateProfessorPassword,
} = require('../controllers/userDatabaseController');
const { syncUserDatabaseAssignment } = require('../controllers/mentorMatchingController');

const router = express.Router();

router.post('/students', authenticate, authorize(['ADMIN']), requireNonEmptyBody, createStudentRecord);
router.post('/valid-student-ids', authenticate, authorize(['ADMIN']), requireNonEmptyBody, importValidStudentIds);
router.post('/professors', authenticate, authorize(['ADMIN']), requireNonEmptyBody, createProfessorRecord);
router.patch(
  '/professors/:professorId/password',
  authenticate,
  authorize(['ADMIN']),
  requireNonEmptyBody,
  updateProfessorPassword
);
router.patch(
  '/groups/:groupId/advisor-assignment',
  authenticate,
  authorize(['COORDINATOR']),
  requireNonEmptyBody,
  syncUserDatabaseAssignment,
);

module.exports = router;
