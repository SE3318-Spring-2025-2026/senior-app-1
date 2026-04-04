const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { registerProfessor } = require('../controllers/adminController.js');

router.post('/professors', authenticate, authorize(['ADMIN']), registerProfessor);

module.exports = router;
