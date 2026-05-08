const { body, param, validationResult } = require('express-validator');
const passwordResetService = require('../services/passwordResetService');

function validationResponse(res, message = 'Validation failed') {
  return res.status(400).json({
    code: 'VALIDATION_ERROR',
    message,
  });
}

function handlePasswordResetError(error, res, next) {
  if (error.status && error.code) {
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
    });
  }

  return next(error);
}

const generatePasswordResetLinkValidation = [
  param('userId').isInt({ min: 1 }).toInt(),
];

async function generatePasswordResetLink(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationResponse(res, 'Valid userId is required.');
  }

  try {
    const result = await passwordResetService.generatePasswordResetLink({
      userId: req.params.userId,
      adminUser: req.user,
    });

    return res.status(201).json({
      message: 'Password reset link generated successfully',
      resetLink: result.resetLink,
      expiresAt: result.expiresAt,
      user: result.user,
    });
  } catch (error) {
    return handlePasswordResetError(error, res, next);
  }
}

const resetPasswordValidation = [
  body('token').isString().trim().notEmpty(),
  body('newPassword').isString().notEmpty(),
];

async function resetPassword(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationResponse(res, 'token and newPassword are required.');
  }

  try {
    await passwordResetService.resetPassword({
      token: req.body.token,
      newPassword: req.body.newPassword,
    });

    return res.status(200).json({
      code: 'PASSWORD_RESET_SUCCESS',
      message: 'Password reset successful',
    });
  } catch (error) {
    return handlePasswordResetError(error, res, next);
  }
}

module.exports = {
  generatePasswordResetLink,
  generatePasswordResetLinkValidation,
  resetPassword,
  resetPasswordValidation,
};
