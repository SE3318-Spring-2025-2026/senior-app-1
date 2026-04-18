const { param, validationResult } = require('express-validator');
const advisorService = require('../services/advisorService');

const buildErrorResponse = (message, code) => ({
  message,
  code,
});

/**
 * GET /api/v1/advisor-requests/:requestId
 * Retrieve advisor request details
 */
const getAdvisorRequestDetails = [
  param('requestId').isString().trim().notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        buildErrorResponse('Invalid request ID', 'INVALID_REQUEST_ID')
      );
    }

    try {
      const { requestId } = req.params;
      const userId = req.user.id;

      const request = await advisorService.getAdvisorRequestDetails(
        requestId,
        userId
      );

      return res.status(200).json(request);
    } catch (error) {
      if (error.code === 'REQUEST_NOT_FOUND') {
        return res.status(404).json(
          buildErrorResponse('Advisor request not found', 'REQUEST_NOT_FOUND')
        );
      }

      if (error.code === 'FORBIDDEN') {
        return res.status(403).json(
          buildErrorResponse(
            'You do not have permission to access this request',
            'FORBIDDEN'
          )
        );
      }

      console.error('Error retrieving advisor request:', error);
      return res.status(500).json(
        buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR')
      );
    }
  },
];

module.exports = {
  getAdvisorRequestDetails,
};
