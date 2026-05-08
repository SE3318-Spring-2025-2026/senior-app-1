const express = require('express');
const { registerRoleUser } = require('../controllers/authController');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const {
  resetPassword,
  resetPasswordValidation,
} = require('../controllers/passwordResetController');

const router = express.Router();

router.post('/register', requireNonEmptyBody, registerRoleUser);
router.post('/reset-password', requireNonEmptyBody, resetPasswordValidation, resetPassword);

module.exports = router;
