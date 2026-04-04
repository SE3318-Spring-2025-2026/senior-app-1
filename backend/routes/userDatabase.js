const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  createProfessorRecord,
  createStudentRecord,
} = require('../controllers/userDatabaseController');

const router = express.Router();

router.post('/students', authenticate, authorize(['ADMIN']), createStudentRecord);
router.post('/professors', authenticate, authorize(['ADMIN']), createProfessorRecord);

module.exports = router;
