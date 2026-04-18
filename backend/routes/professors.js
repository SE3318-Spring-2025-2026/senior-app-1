const express = require('express');
const { loginProfessor, setupProfessorPassword } = require('../controllers/professorController');

const router = express.Router();

router.post('/login', loginProfessor);
router.post('/password-setup', setupProfessorPassword);

module.exports = router;
