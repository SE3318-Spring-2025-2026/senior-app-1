const express = require('express');
const { registerRoleUser } = require('../controllers/authController');
const { requireNonEmptyBody } = require('../middleware/requestValidation');

const router = express.Router();

router.post('/register', requireNonEmptyBody, registerRoleUser);

module.exports = router;
