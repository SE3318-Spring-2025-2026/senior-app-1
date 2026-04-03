const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');

const setupProfessorPassword = [
  body('setupToken').isString().trim().notEmpty(),
  body('newPassword').isString().notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
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
        return res.status(400).json({ message: 'Setup token is invalid or expired' });
      }

      if (error.message === 'INVALID_PASSWORD_POLICY') {
        return res.status(400).json({
          message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
        });
      }

      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
];

module.exports = { setupProfessorPassword };
