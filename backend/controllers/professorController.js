const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const professorService = require('../services/professorService');
const { Professor, User } = require('../models');
const { logUserEvent } = require('../services/userEventLogService');

const buildErrorResponse = (message, errorCode) => ({
  message,
  errorCode,
});

const loginProfessor = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        buildErrorResponse('Professor email and password are required', 'VALIDATION_FAILED')
      );
    }

    const { email, password } = req.body;
    const user = await req.app.locals.models.User.findOne({
      where: {
        email,
        role: 'PROFESSOR',
      },
    });

    if (!user || user.status !== 'ACTIVE' || !user.password) {
      logUserEvent(req, {
        action: 'USER_LOGIN_FAILED',
        targetType: 'USER',
        metadata: { attemptedEmail: email, attemptedRole: 'PROFESSOR', reason: 'USER_NOT_FOUND' },
      });
      return res.status(401).json(
        buildErrorResponse('Invalid professor email or password', 'INVALID_CREDENTIALS')
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      logUserEvent(req, {
        action: 'USER_LOGIN_FAILED',
        targetType: 'USER',
        targetId: user.id,
        metadata: { attemptedEmail: email, attemptedRole: 'PROFESSOR', reason: 'WRONG_PASSWORD' },
      });
      return res.status(401).json(
        buildErrorResponse('Invalid professor email or password', 'INVALID_CREDENTIALS')
      );
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json(
        buildErrorResponse('JWT secret is not configured.', 'JWT_SECRET_MISSING')
      );
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);

    logUserEvent(req, {
      action: 'USER_LOGIN_SUCCESS',
      actorId: user.id,
      targetType: 'USER',
      targetId: user.id,
      metadata: { role: user.role },
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      message: 'Professor login successful.',
    });
  },
];

const setupProfessorPassword = [
  body('newPassword').isString().notEmpty(),
  body('setupToken').optional().isString().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        buildErrorResponse('Invalid request body', 'VALIDATION_FAILED')
      );
    }

    const { setupToken, email, newPassword } = req.body;
    const hasSetupToken = typeof setupToken === 'string' && setupToken.trim().length > 0;
    const hasEmail = typeof email === 'string' && email.trim().length > 0;

    if (!hasSetupToken && !hasEmail) {
      return res.status(400).json(
        buildErrorResponse('setupToken or email is required', 'VALIDATION_FAILED')
      );
    }

    try {
      const result = hasSetupToken
        ? await professorService.setInitialPassword(setupToken, newPassword)
        : await professorService.setInitialPasswordByEmail(email, newPassword);

      logUserEvent(req, {
        action: 'PROFESSOR_PASSWORD_SETUP_SUCCESS',
        actorId: result.userId || null,
        targetType: 'USER',
        targetId: result.userId || null,
        metadata: { attemptedEmail: email || null },
      });

      return res.status(200).json(result);
    } catch (error) {
      if (error.message === 'INVALID_SETUP_TOKEN') {
        logUserEvent(req, {
          action: 'PROFESSOR_PASSWORD_SETUP_FAILED',
          targetType: 'USER',
          metadata: { reason: 'INVALID_SETUP_TOKEN' },
        });
        return res.status(404).json(
          buildErrorResponse(
            'Setup token is invalid, expired, or already used',
            'SETUP_TOKEN_NOT_FOUND'
          )
        );
      }

      if (error.message === 'PROFESSOR_SETUP_ALREADY_COMPLETED') {
        logUserEvent(req, {
          action: 'PROFESSOR_PASSWORD_SETUP_FAILED',
          targetType: 'USER',
          metadata: { attemptedEmail: email || null, reason: 'PROFESSOR_SETUP_ALREADY_COMPLETED' },
        });
        return res.status(409).json(
          buildErrorResponse(
            'Professor initial password setup has already been completed',
            'PROFESSOR_SETUP_ALREADY_COMPLETED'
          )
        );
      }

      if (error.message === 'INVALID_PASSWORD_POLICY') {
        logUserEvent(req, {
          action: 'PROFESSOR_PASSWORD_SETUP_FAILED',
          targetType: 'USER',
          metadata: { attemptedEmail: email || null, reason: 'INVALID_PASSWORD_POLICY' },
        });
        return res.status(422).json(
          buildErrorResponse(
            'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
            'INVALID_PASSWORD_POLICY'
          )
        );
      }

      if (error.message === 'PROFESSOR_SETUP_NOT_FOUND' || error.message === 'INVALID_PROFESSOR_EMAIL') {
        logUserEvent(req, {
          action: 'PROFESSOR_PASSWORD_SETUP_FAILED',
          targetType: 'USER',
          metadata: { attemptedEmail: email || null, reason: error.message },
        });
        return res.status(404).json(
          buildErrorResponse(
            'Professor setup request not found or already completed',
            'PROFESSOR_SETUP_NOT_FOUND'
          )
        );
      }

      return res.status(500).json(
        buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR')
      );
    }
  },
];

async function listProfessors(req, res) {
  try {
    const professors = await Professor.findAll({
      include: [
        {
          model: User,
          attributes: ['id', 'fullName', 'email', 'role'],
          where: { role: 'PROFESSOR' },
        },
      ],
    });

    return res.status(200).json(
      professors
        .map((professor) => ({
        id: professor.userId,
        professorProfileId: professor.id,
        fullName: professor.User?.fullName || '',
        email: professor.User?.email || '',
        department: professor.department || '',
        }))
        .sort((left, right) => left.fullName.localeCompare(right.fullName)),
    );
  } catch (error) {
    console.error('Error listing professors:', error);
    return res.status(500).json(
      buildErrorResponse('Failed to fetch professors', 'INTERNAL_SERVER_ERROR'),
    );
  }
}

module.exports = { loginProfessor, setupProfessorPassword, listProfessors };
