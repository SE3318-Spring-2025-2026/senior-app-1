const { body, validationResult } = require('express-validator');
const githubLinkService = require('../services/githubLinkService');
const studentService = require('../services/studentService');

function shouldRedirectToFrontend(req) {
  // Browser navigations expect a redirect back to the UI, while API clients expect JSON.
  return req.headers.accept?.includes('text/html');
}

function redirectToFrontendWithResult(res, status, params) {
  // The frontend consumes a compact query-based result so it can render success/failure
  // without exposing raw callback internals like code/state in the final URL.
  const url = new URL(githubLinkService.getFrontendUrl());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  url.searchParams.set('githubLink', status);
  return res.redirect(url.toString());
}

function buildRegistrationValidationError(field) {
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
      return { code: 'INVALID_REGISTRATION_INPUT', message: 'Registration input is invalid.' };
  }
}

const registerStudentValidation = [
  body('studentId').isString().trim().matches(/^[0-9]{11}$/),
  body('email').isEmail().normalizeEmail(),
  body('fullName').isString().trim().isLength({ min: 3 }),
  body('password').isString().isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const validationError = buildRegistrationValidationError(errors.array()[0].path);
      return res.status(400).json(validationError);
    }

    const { studentId, email, fullName, password } = req.body;

    // Registration is intentionally layered: first format checks, then business rules
    // like eligibility, duplicate student IDs, duplicate emails, and password strength.
    if (!(await studentService.isStudentIdEligible(studentId))) {
      return res.status(403).json({
        code: 'STUDENT_NOT_ELIGIBLE',
        message: 'Student ID is not eligible for registration.',
      });
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

    if (!studentService.validatePasswordStrength(password)) {
      return res.status(400).json({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
      });
    }

    const student = await studentService.createStudent({
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

async function getStudentValidation(req, res) {
  const { studentId } = req.params;
  // This endpoint lets the UI check whether a student ID is both well-formed and
  // currently eligible before attempting a full registration request.
  const valid =
    studentService.validateStudentIdFormat(studentId) &&
    (await studentService.isStudentIdEligible(studentId));
  const alreadyRegistered = valid ? await studentService.isStudentRegistered(studentId) : false;

  return res.json({
    valid,
    studentId,
    alreadyRegistered,
  });
}

const updateStudentGitHubLink = [
  body('githubUsername').isString().trim().notEmpty(),
  body('githubLinked').isBoolean(),
  async (req, res) => {
    const student = await studentService.getStudentByStudentId(req.params.studentId);
    if (!student) {
      return res.status(404).json({
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found.',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_GITHUB_LINK',
        message: 'GitHub username and link status are required.',
      });
    }

    const updatedStudent = await studentService.updateStudentGitHubLink(
      req.params.studentId,
      req.body.githubUsername.trim(),
      req.body.githubLinked,
    );

    return res.json({
      studentId: updatedStudent.studentId,
      githubLinked: updatedStudent.githubLinked,
      message: 'Student GitHub link updated successfully',
    });
  },
];

async function startGitHubLink(req, res) {
  // The GitHub linking flow is intentionally bound to the current authenticated student.
  // This prevents linking by just typing an arbitrary student ID on the frontend.
  if (req.user.role !== 'STUDENT' || req.user.status !== 'ACTIVE' || !req.user.studentId) {
    return res.status(403).json({
      code: 'STUDENT_AUTH_REQUIRED',
      message: 'Active authenticated student account required.',
    });
  }

  const state = await githubLinkService.createOAuthState(req.user.id);
  return res.json({
    authorizationUrl: githubLinkService.buildAuthorizationUrl(state),
  });
}

async function handleGitHubCallback(req, res) {
  const { code, state } = req.query;
  if (!code || !state) {
    if (shouldRedirectToFrontend(req)) {
      return redirectToFrontendWithResult(res, 'error', {
        code: 'INVALID_CALLBACK',
        message: 'code and state are required.',
      });
    }

    return res.status(400).json({
      code: 'INVALID_CALLBACK',
      message: 'code and state are required.',
    });
  }

  // The OAuth state record ties the callback back to the student who started the flow
  // and is invalidated after first use to block replay attempts.
  const oauthState = await githubLinkService.consumeOAuthState(state);
  if (!oauthState) {
    if (shouldRedirectToFrontend(req)) {
      return redirectToFrontendWithResult(res, 'error', {
        code: 'INVALID_OAUTH_STATE',
        message: 'Invalid or expired OAuth state.',
      });
    }

    return res.status(400).json({
      code: 'INVALID_OAUTH_STATE',
      message: 'Invalid or expired OAuth state.',
    });
  }

  const student = await req.app.locals.models.User.findOne({
    where: {
      id: oauthState.userId,
      role: 'STUDENT',
    },
  });

  if (!student) {
    if (shouldRedirectToFrontend(req)) {
      return redirectToFrontendWithResult(res, 'error', {
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found.',
      });
    }

    return res.status(404).json({
      code: 'STUDENT_NOT_FOUND',
      message: 'Student not found.',
    });
  }

  try {
    // Once the callback is verified, the backend owns the rest of the flow:
    // exchange the code, fetch the GitHub profile, persist the link, and update the student.
    const accessToken = await githubLinkService.exchangeCodeForToken(code);
    const profile = await githubLinkService.fetchGitHubProfile(accessToken, student);
    await githubLinkService.storeLinkedGitHubAccount({
      studentId: student.studentId,
      githubId: profile.githubId,
      githubUsername: profile.githubUsername,
    });

    if (shouldRedirectToFrontend(req)) {
      return redirectToFrontendWithResult(res, 'success', {
        githubUsername: profile.githubUsername,
        studentId: student.studentId,
        mockOAuth: githubLinkService.hasRealGitHubOAuthConfig() ? '' : '1',
      });
    }

    return res.json({
      callbackVerified: true,
      githubLinked: true,
      githubUsername: profile.githubUsername,
    });
  } catch (error) {
    const status = (
      error.code === 'GITHUB_ACCOUNT_ALREADY_LINKED' ||
      error.code === 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT'
    ) ? 409 : 500;

    if (shouldRedirectToFrontend(req)) {
      return redirectToFrontendWithResult(res, 'error', {
        code: error.code || 'GITHUB_CALLBACK_FAILED',
        message: error.message || 'GitHub callback processing failed.',
      });
    }

    return res.status(status).json({
      code: error.code || 'GITHUB_CALLBACK_FAILED',
      message: error.message || 'GitHub callback processing failed.',
    });
  }
}

const storeLinkedGitHubAccount = [
  body('studentId').isString().trim().matches(/^[0-9]{11}$/),
  body('githubId').isString().trim().notEmpty(),
  body('githubUsername').isString().trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_LINKED_ACCOUNT',
        message: 'studentId, githubId, and githubUsername are required.',
      });
    }

    try {
      // This endpoint is also usable as a dedicated persistence boundary for the
      // linked-account store, even though the callback flow already calls into it internally.
      await githubLinkService.storeLinkedGitHubAccount({
        studentId: req.body.studentId.trim(),
        githubId: req.body.githubId.trim(),
        githubUsername: req.body.githubUsername.trim(),
      });

      return res.json({
        linked: true,
        message: 'GitHub account link stored successfully',
      });
    } catch (error) {
      if (error.code === 'STUDENT_NOT_FOUND') {
        return res.status(404).json({
          code: error.code,
          message: error.message,
        });
      }

      if (error.code === 'GITHUB_ACCOUNT_ALREADY_LINKED') {
        return res.status(409).json({
          code: error.code,
          message: error.message,
        });
      }

      if (error.code === 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT') {
        return res.status(409).json({
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'LINK_UPDATE_FAILED',
        message: 'Student GitHub link could not be updated.',
      });
    }
  },
];

module.exports = {
  getStudentValidation,
  handleGitHubCallback,
  registerStudentValidation,
  startGitHubLink,
  storeLinkedGitHubAccount,
  updateStudentGitHubLink,
};
