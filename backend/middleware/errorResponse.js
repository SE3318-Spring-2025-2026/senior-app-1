const ApiError = require('../errors/apiError');

const DEFAULT_ERROR_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  500: 'INTERNAL_ERROR',
};

function inferErrorCode(statusCode, body) {
  if (body && typeof body === 'object') {
    if (typeof body.code === 'string' && body.code.trim()) {
      return body.code;
    }
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return 'VALIDATION_ERROR';
    }
  }

  return DEFAULT_ERROR_CODES[statusCode] || 'REQUEST_FAILED';
}

function inferErrorMessage(statusCode, body) {
  if (body && typeof body === 'object' && typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  if (statusCode >= 500) {
    return 'Internal server error';
  }

  return 'Request failed';
}

function normalizeValidationDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return detail;
  }

  if (typeof detail.msg === 'string') {
    return {
      field: detail.path || null,
      message: detail.msg,
      location: detail.location || null,
      value: Object.prototype.hasOwnProperty.call(detail, 'value') ? detail.value : undefined,
    };
  }

  return detail;
}

function normalizeDetails(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return undefined;
  }

  return details.map(normalizeValidationDetail);
}

function buildErrorResponse(statusCode, payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const response = {
    success: false,
    code: inferErrorCode(statusCode, payload),
    message: inferErrorMessage(statusCode, payload),
  };

  const details = normalizeDetails(source.details || source.errors);
  if (details) {
    response.details = details;
  }

  Object.entries(source).forEach(([key, value]) => {
    if (['success', 'code', 'message', 'details', 'errors'].includes(key)) {
      return;
    }
    response[key] = value;
  });

  return response;
}

function errorResponseNormalizer(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function normalizedJson(payload) {
    if (res.statusCode >= 400) {
      return originalJson(buildErrorResponse(res.statusCode, payload));
    }

    return originalJson(payload);
  };

  next();
}

function notFoundHandler(req, res) {
  if (!req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  }

  return res.status(404).json({
    code: 'ROUTE_NOT_FOUND',
    message: 'API route not found',
  });
}

function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = Number.isInteger(err?.status) ? err.status : 500;
  const message = status >= 500 ? 'Internal server error' : err?.message || 'Request failed';
  const code = typeof err?.code === 'string' && err.code.trim()
    ? err.code
    : inferErrorCode(status, err);

  if (status >= 500) {
    console.error(err?.stack || err);
  }

  return res.status(status).json({
    code,
    message,
    details: Array.isArray(err?.details) ? err.details : undefined,
  });
}

module.exports = {
  ApiError,
  buildErrorResponse,
  errorResponseNormalizer,
  globalErrorHandler,
  notFoundHandler,
};
