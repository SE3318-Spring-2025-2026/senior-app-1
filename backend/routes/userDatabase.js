const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  createProfessorRecord,
  createStudentRecord,
  storeValidStudentIds,
  checkStudentValidation,
} = require('../controllers/userDatabaseController');
// GET /api/v1/user-database/students/:studentId/validation
router.get('/students/:studentId/validation', checkStudentValidation);

const router = express.Router();


// POST /api/v1/user-database/valid-student-ids
router.post('/valid-student-ids', authenticate, authorize(['ADMIN', 'COORDINATOR']), storeValidStudentIds);

router.post('/students', authenticate, authorize(['ADMIN']), createStudentRecord);
router.post('/professors', authenticate, authorize(['ADMIN']), createProfessorRecord);
router.patch(
  '/professors/:professorId/password',
  authenticate,
  authorize(['ADMIN']),
  updateProfessorPassword
);

module.exports = router;
