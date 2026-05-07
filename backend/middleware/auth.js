const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../errors/apiError');
const { logUserEvent } = require('../services/userEventLogService');

const authenticate = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : null;

  if (!token) {
    await logUserEvent(req, {
      action: 'AUTH_TOKEN_MISSING',
      targetType: 'ENDPOINT',
      targetId: req.path,
      metadata: { reason: 'NO_BEARER_TOKEN' },
    });
    return next(ApiError.unauthorized('AUTH_TOKEN_MISSING', 'Access denied'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user) {
      await logUserEvent(req, {
        action: 'AUTH_TOKEN_INVALID',
        targetType: 'ENDPOINT',
        targetId: req.path,
        metadata: { reason: 'USER_NOT_FOUND' },
      });
      return next(ApiError.unauthorized('INVALID_TOKEN', 'Invalid token'));
    }

    req.user = user;
    return next();
  } catch (err) {
    await logUserEvent(req, {
      action: 'AUTH_TOKEN_INVALID',
      targetType: 'ENDPOINT',
      targetId: req.path,
      metadata: { reason: 'JWT_VERIFY_FAILED' },
    });
    return next(ApiError.unauthorized('INVALID_TOKEN', 'Invalid token'));
  }
};

const authorize = (roles) => async (req, _res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('UNAUTHORIZED', 'Unauthorized'));
  }

  if (!roles.includes(req.user.role)) {
    await logUserEvent(req, {
      action: 'AUTH_FORBIDDEN',
      actorId: req.user.id,
      targetType: 'ENDPOINT',
      targetId: req.path,
      metadata: { userRole: req.user.role, requiredRoles: roles },
    });
    return next(ApiError.forbidden('FORBIDDEN', 'Forbidden'));
  }

  return next();
};

module.exports = { authenticate, authorize };
