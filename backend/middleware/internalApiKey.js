function authenticateInternalApiKey(req, res, next) {
  const suppliedApiKey = req.header('x-internal-api-key');
  const expectedApiKey = process.env.INTERNAL_API_KEY;

  if (!expectedApiKey) {
    return res.status(500).json({
      code: 'INTERNAL_API_KEY_NOT_CONFIGURED',
      message: 'Internal API key is not configured',
    });
  }

  if (!suppliedApiKey || suppliedApiKey !== expectedApiKey) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Valid internal API key is required',
    });
  }

  return next();
}

module.exports = { authenticateInternalApiKey };
