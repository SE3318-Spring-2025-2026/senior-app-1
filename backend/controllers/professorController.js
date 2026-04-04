const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');

const buildErrorResponse = (message, errorCode) => ({
  message,
  errorCode,
});

const setupProfessorPassword = [
  body('setupToken').isString().trim().notEmpty(),
  body('newPassword').isString().notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        buildErrorResponse('Invalid request body', 'VALIDATION_FAILED')
      );
    }

    const { setupToken, newPassword } = req.body;

    try {
      const result = await professorService.setInitialPassword(
        setupToken,
        newPassword
      );

      return res.status(200).json(result);
    } catch (error) {
      if (error.message === 'INVALID_SETUP_TOKEN') {
        return res.status(404).json(
          buildErrorResponse(
            'Setup token is invalid, expired, or already used',
            'SETUP_TOKEN_NOT_FOUND'
          )
        );
      }

      if (error.message === 'INVALID_PASSWORD_POLICY') {
        return res.status(422).json(
          buildErrorResponse(
            'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
            'INVALID_PASSWORD_POLICY'
          )
        );
      }

      return res.status(500).json(
        buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR')
      );
    }
  },
];

module.exports = { setupProfessorPassword };
