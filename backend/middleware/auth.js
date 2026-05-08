const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../errors/apiError');

const authenticate = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : null;

  if (!token) {
    return next(ApiError.unauthorized('AUTH_TOKEN_MISSING', 'Access denied'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return next(ApiError.unauthorized('INVALID_TOKEN', 'Invalid token'));
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(ApiError.unauthorized('INVALID_TOKEN', 'Invalid token'));
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('UNAUTHORIZED', 'Unauthorized'));
  }

  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('FORBIDDEN', 'Forbidden'));
  }

  return next();
};

module.exports = { authenticate, authorize };
