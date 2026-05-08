const { body, validationResult } = require('express-validator');
const studentRegistrationService = require('../services/studentRegistrationService');
const StudentRegistrationError = require('../errors/studentRegistrationError');

const registerRoleUser = [
  body('role').isString().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('fullName').isString().trim().isLength({ min: 3 }),
  body('password').isString().isLength({ min: 8 }),
  body('studentId').isString().trim().matches(/^[0-9]{11}$/),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_SIGNUP_INPUT',
        message: 'Sign up input is invalid.',
        details: errors.array(),
      });
    }

    const role = String(req.body.role || '').trim().toUpperCase();
    if (role !== 'STUDENT') {
      return res.status(403).json({
        code: 'ROLE_SIGNUP_NOT_ALLOWED',
        message: 'Only Student self sign-up is allowed. Professor accounts are admin-invite only. Coordinator/Admin are provisioned by operations.',
      });
    }

    const { studentId, email, fullName, password } = req.body;
    try {
      const student = await studentRegistrationService.validateAndCreateStudent({
        studentId,
        email,
        fullName,
        password,
      });

      return res.status(201).json({
        code: 'STUDENT_CREATED',
        user: {
          id: student.id,
          studentId: student.studentId,
          email: student.email,
          fullName: student.fullName,
          role: student.role,
        },
        message: 'Student account created successfully.',
      });
    } catch (error) {
      if (error instanceof StudentRegistrationError) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      throw error;
    }
  },
];

module.exports = {
  registerRoleUser,
};
