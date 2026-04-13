const express = require('express');
const { registerRoleUser } = require('../controllers/authController');

const router = express.Router();

router.post('/register', registerRoleUser);

module.exports = router;
