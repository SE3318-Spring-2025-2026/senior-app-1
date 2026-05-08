function buildEmptyBodyErrorResponse() {
  return {
    code: 'VALIDATION_ERROR',
    message: 'Request body must not be null or empty',
    errors: {
      body: ['Request body must not be null or empty'],
    },
  };
}

function isEmptyBody(body) {
  if (body == null) {
    return true;
  }

  if (Array.isArray(body)) {
    return true;
  }

  if (typeof body !== 'object') {
    return true;
  }

  return Object.keys(body).length === 0;
}

function requireNonEmptyBody(req, res, next) {
  if (isEmptyBody(req.body)) {
    return res.status(400).json(buildEmptyBodyErrorResponse());
  }

  return next();
}

module.exports = {
  requireNonEmptyBody,
};
