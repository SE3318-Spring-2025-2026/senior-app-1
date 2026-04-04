const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');
const studentAccountService = require('../services/studentAccountService');
const studentService = require('../services/studentService');

function buildStudentAccountError(field) {
  switch (field) {
    case 'studentId':
      return { code: 'INVALID_STUDENT_ID', message: 'Student ID must be an 11-digit number.' };
    case 'email':
      return { code: 'INVALID_EMAIL', message: 'Email address is invalid.' };
    case 'fullName':
      return { code: 'INVALID_FULL_NAME', message: 'Full name must be at least 3 characters.' };
    case 'password':
      return {
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
      };
    default:
      return { code: 'INVALID_CREATE_STUDENT_INPUT', message: 'Student account input is invalid.' };
  }
}

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

const createStudentRecord = [
  body('studentId').isString().trim().matches(/^[0-9]{11}$/),
  body('email').isEmail().normalizeEmail(),
  body('fullName').isString().trim().isLength({ min: 3 }),
  body('password').isString().isLength({ min: 8 }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const validationError = buildStudentAccountError(errors.array()[0].path);
      return res.status(400).json(validationError);
    }

    const { studentId, email, fullName, password } = req.body;

    if (!(await studentService.isStudentIdEligible(studentId))) {
      return res.status(403).json({
        code: 'STUDENT_NOT_ELIGIBLE',
        message: 'Student ID is not eligible for registration.',
      });
    }

    if (!studentService.validatePasswordStrength(password)) {
      return res.status(400).json(buildStudentAccountError('password'));
    }

    if (await studentService.isStudentRegistered(studentId)) {
      return res.status(409).json({
        code: 'ALREADY_REGISTERED',
        message: 'Student is already registered.',
      });
    }

    if (await studentService.findStudentByEmail(email)) {
      return res.status(409).json({
        code: 'DUPLICATE_EMAIL',
        message: 'Email is already in use.',
      });
    }

    const student = await studentAccountService.createStudentAccountFromValidatedData({
      studentId,
      email,
      fullName,
      password,
    });

    return res.status(201).json({
      valid: true,
      userId: student.id,
      studentId: student.studentId,
      message: 'Student account created successfully',
    });
  },
];

module.exports = {
  createProfessorRecord,
  createStudentRecord,
};
