class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (Array.isArray(details) && details.length > 0) {
      this.details = details;
    }
  }

  static badRequest(code, message, details) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(code, message, details) {
    return new ApiError(401, code, message, details);
  }

  static forbidden(code, message, details) {
    return new ApiError(403, code, message, details);
  }

  static notFound(code, message, details) {
    return new ApiError(404, code, message, details);
  }

  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}

module.exports = ApiError;
