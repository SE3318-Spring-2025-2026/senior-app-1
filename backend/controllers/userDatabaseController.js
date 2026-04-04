const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');

const createProfessorRecord = [
  body('email').isEmail().normalizeEmail(),
  body('fullName').notEmpty().trim(),
  body('department').notEmpty().trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_PROFESSOR_RECORD',
        message: 'Email, full name, and department are required.',
      });
    }

    const { email, fullName, department } = req.body;

    try {
      const result = await professorService.createProfessorRecord(
        email,
        fullName,
        department
      );

      return res.status(201).json(result);
    } catch (error) {
      if (error.code === 'DUPLICATE_EMAIL' || error.message === 'User with this email already exists') {
        return res.status(409).json({
          code: 'DUPLICATE_EMAIL',
          message: 'Email is already in use.',
        });
      }

      return res.status(500).json({
        code: 'PROFESSOR_RECORD_CREATE_FAILED',
        message: 'Professor record could not be created.',
      });
    }
  },
];

module.exports = { createProfessorRecord };
