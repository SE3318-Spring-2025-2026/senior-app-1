const express = require('express');
const { createProfessorRecord } = require('../controllers/userDatabaseController');

const router = express.Router();

router.post('/professors', createProfessorRecord);

module.exports = router;
