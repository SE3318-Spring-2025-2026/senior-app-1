const express = require('express');
const { updateProfessorPassword } = require('../controllers/userDatabaseController');

const router = express.Router();

router.patch('/professors/:professorId/password', updateProfessorPassword);

module.exports = router;
