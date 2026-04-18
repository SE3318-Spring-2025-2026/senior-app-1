const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  loginProfessor,
  setupProfessorPassword,
  listProfessors,
} = require('../controllers/professorController');

const router = express.Router();

router.post('/login', loginProfessor);
router.post('/password-setup', setupProfessorPassword);
router.get('/', authenticate, authorize(['STUDENT', 'PROFESSOR', 'ADMIN', 'COORDINATOR']), listProfessors);
router.get('/list', authenticate, authorize(['STUDENT', 'PROFESSOR', 'ADMIN', 'COORDINATOR']), listProfessors);

module.exports = router;
