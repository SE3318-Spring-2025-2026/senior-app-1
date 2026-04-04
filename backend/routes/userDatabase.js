const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { createProfessorRecord } = require('../controllers/userDatabaseController');

const router = express.Router();

router.post('/professors', authenticate, authorize(['ADMIN']), createProfessorRecord);

module.exports = router;
