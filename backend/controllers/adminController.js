const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');

const registerProfessor = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),

  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 3, max: 120 })
    .withMessage('Full name must be between 3 and 120 characters'),

  body('department')
    .trim()
    .notEmpty()
    .withMessage('Department is required')
    .isLength({ min: 2, max: 120 })
    .withMessage('Department must be between 2 and 120 characters'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array(),
      });
    }

    const { email, fullName, department } = req.body;

    try {
      const result = await professorService.registerProfessor(email, fullName, department);

      return res.status(201).json({
        userId: result.userId,
        professorId: result.professorId,
        message: 'Professor account created. Password setup required.',
      });
    } catch (error) {
      if (error.message === 'User with this email already exists') {
        return res.status(409).json({
          message: 'User with this email already exists',
        });
      }

      if (error.code === 11000 && error.keyPattern?.email) {
        return res.status(409).json({
          message: 'User with this email already exists',
        });
      }

      console.error('registerProfessor controller error:', error);

      return res.status(500).json({
        message: 'Internal Server Error',
      });
    }
  },
];

module.exports = { registerProfessor };