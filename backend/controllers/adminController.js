const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const professorService = require('../services/professorService');

function buildRoleLoginHandler(role, successMessage, invalidMessage, failureCode) {
  return async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Email and password are required.',
          code: 'INVALID_LOGIN_INPUT',
        });
      }

      const { email, password } = req.body;
      const user = await req.app.locals.models.User.findOne({
        where: {
          email,
          role,
        },
      });

      if (!user || !user.password) {
        return res.status(401).json({
          message: invalidMessage,
          code: 'INVALID_CREDENTIALS',
        });
      }

      const passwordMatches = await bcrypt.compare(password, user.password);

      if (!passwordMatches) {
        return res.status(401).json({
          message: invalidMessage,
          code: 'INVALID_CREDENTIALS',
        });
      }

      if (!process.env.JWT_SECRET) {
        return res.status(500).json({
          message: 'JWT secret is not configured.',
          code: 'JWT_SECRET_MISSING',
        });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);

      return res.status(200).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        message: successMessage,
      });
    } catch (error) {
      console.error(`${role} login failed unexpectedly:`, error);
      return res.status(500).json({
        message: `${role} login could not be completed.`,
        code: failureCode,
      });
    }
  };
}

const adminLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
  buildRoleLoginHandler(
    'ADMIN',
    'Admin login successful.',
    'Invalid admin email or password.',
    'ADMIN_LOGIN_FAILED',
  ),
];

const coordinatorLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
  buildRoleLoginHandler(
    'COORDINATOR',
    'Coordinator login successful.',
    'Invalid coordinator email or password.',
    'COORDINATOR_LOGIN_FAILED',
  ),
];

const registerProfessor = [
  // Validation
  body('email').isEmail().normalizeEmail(),
  body('fullName').notEmpty().trim(),
  body('department').notEmpty().trim(),

  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, fullName, department } = req.body;
      const result = await professorService.registerProfessor(
        email,
        fullName,
        department
      );

      return res.status(201).json({
        userId: result.userId,
        professorId: result.professorId,
        setupTokenGenerated: result.setupTokenGenerated,
        setupToken: result.setupToken,
        passwordSetupTokenExpiresAt: result.passwordSetupTokenExpiresAt,
        message: 'Professor account created. Password setup link generated.'
      });

    } catch (error) {
      if (error.code === 'DUPLICATE_EMAIL' || error.message === 'User with this email already exists') {
        return res.status(409).json({ message: error.message });
      }

      console.error('Professor registration failed unexpectedly:', error);
      return res.status(500).json({
        message: 'Internal Server Error'
      });
    }
  },
];

module.exports = { adminLogin, coordinatorLogin, registerProfessor };
