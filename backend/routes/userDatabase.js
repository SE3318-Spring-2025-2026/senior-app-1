const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  createProfessorRecord,
  createStudentRecord,
  updateProfessorPassword,
} = require('../controllers/userDatabaseController');

const router = express.Router();

router.post('/students', authenticate, authorize(['ADMIN']), createStudentRecord);
router.post('/professors', authenticate, authorize(['ADMIN']), createProfessorRecord);
router.patch(
  '/professors/:professorId/password',
  authenticate,
  authorize(['ADMIN']),
  updateProfessorPassword
);

module.exports = router;
