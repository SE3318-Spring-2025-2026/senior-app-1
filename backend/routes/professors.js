const express = require('express');
const { setupProfessorPassword } = require('../controllers/professorController');

const router = express.Router();

router.post('/password-setup', setupProfessorPassword);

module.exports = router;
