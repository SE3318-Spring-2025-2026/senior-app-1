const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');

const registerProfessor = [
  // Validation
  body('email').isEmail().normalizeEmail(),
  body('fullName').notEmpty().trim(),
  body('department').notEmpty().trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, fullName, department } = req.body;

    try {
      const result = await professorService.registerProfessor(
        email,
        fullName,
        department
      );

      return res.status(201).json({
        userId: result.userId,
        professorId: result.professorId,
        setupTokenGenerated: result.setupTokenGenerated,
        message: 'Professor account created. Password setup link generated.'
      });

    } catch (error) {
      if (error.message === 'User with this email already exists') {
        return res.status(409).json({ message: error.message });
      }

      return res.status(500).json({
        message: 'Internal Server Error'
      });
    }
  },
];

module.exports = { registerProfessor };
