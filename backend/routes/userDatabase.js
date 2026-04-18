const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  createProfessorRecord,
  createStudentRecord,
  importValidStudentIds,
  updateProfessorPassword,
} = require('../controllers/userDatabaseController');
const { syncUserDatabaseAssignment } = require('../controllers/mentorMatchingController');

const router = express.Router();

router.post('/students', authenticate, authorize(['ADMIN']), createStudentRecord);
router.post('/valid-student-ids', authenticate, authorize(['ADMIN']), importValidStudentIds);
router.post('/professors', authenticate, authorize(['ADMIN']), createProfessorRecord);
router.patch(
  '/professors/:professorId/password',
  authenticate,
  authorize(['ADMIN']),
  updateProfessorPassword
);
router.patch(
  '/groups/:groupId/advisor-assignment',
  authenticate,
  authorize(['COORDINATOR']),
  syncUserDatabaseAssignment,
);

module.exports = router;
