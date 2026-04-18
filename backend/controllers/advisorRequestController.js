const { body, param, validationResult } = require('express-validator');
const advisorRequestService = require('../services/advisorRequestService');

function buildErrorResponse(field) {
  switch (field) {
    case 'groupId':
      return { code: 'INVALID_GROUP_ID', message: 'Group ID must be a positive integer.' };
    case 'professorId':
      return { code: 'INVALID_PROFESSOR_ID', message: 'Professor ID must be a positive integer.' };
    case 'status':
      return { code: 'INVALID_STATUS', message: 'Status must be APPROVED or REJECTED.' };
    default:
      return { code: 'INVALID_INPUT', message: 'Input validation failed.' };
  }
}

function getValidationError(req) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return null;
  }
  return buildErrorResponse(errors.array()[0].path);
}

const validateAdvisorRequest = [
  body('groupId').isInt({ min: 1 }),
  body('professorId').isInt({ min: 1 }),
];

const createAdvisorRequest = [
  ...validateAdvisorRequest,
  async (req, res) => {
    const validationError = getValidationError(req);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { groupId, professorId } = req.body;
    const teamLeaderId = req.user.id;

    try {
      const request = await advisorRequestService.createAdvisorRequest({
        groupId,
        professorId,
        teamLeaderId,
      });

      return res.status(201).json({
        id: request.id,
        groupId: request.groupId,
        professorId: request.professorId,
        teamLeaderId: request.teamLeaderId,
        status: request.status,
        createdAt: request.createdAt,
      });
    } catch (error) {
      if (error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }
      console.error('Error creating advisor request:', error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    }
  },
];

const getAdvisorRequestsByGroup = [
  param('groupId').isInt({ min: 1 }),
  async (req, res) => {
    const validationError = getValidationError(req);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { groupId } = req.params;

    try {
      const requests = await advisorRequestService.getGroupAdvisorRequests({
        groupId: parseInt(groupId, 10),
      });

      return res.status(200).json(requests);
    } catch (error) {
      if (error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }
      console.error('Error fetching advisor requests:', error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    }
  },
];

const getIncomingRequests = [
  async (req, res) => {
    const professorId = req.user.id;

    try {
      const requests = await advisorRequestService.getProfessorIncomingRequests({
        professorId,
      });

      return res.status(200).json(requests);
    } catch (error) {
      if (error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }
      console.error('Error fetching incoming requests:', error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    }
  },
];

const updateAdvisorRequestStatus = [
  param('requestId').isInt({ min: 1 }),
  body('status').isIn(['APPROVED', 'REJECTED']),
  body('decisionNote').optional().isString().trim(),
  async (req, res) => {
    const validationError = getValidationError(req);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { requestId } = req.params;
    const { status, decisionNote } = req.body;
    const professorId = req.user.id;

    try {
      const request = await advisorRequestService.updateAdvisorRequestStatus({
        requestId: parseInt(requestId, 10),
        status,
        decisionNote,
        professorId,
      });

      return res.status(200).json({
        id: request.id,
        groupId: request.groupId,
        status: request.status,
        decisionNote: request.decisionNote,
        updatedAt: request.updatedAt,
      });
    } catch (error) {
      if (error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }
      console.error('Error updating advisor request:', error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    }
  },
];

const cancelAdvisorRequest = [
  param('requestId').isInt({ min: 1 }),
  async (req, res) => {
    const validationError = getValidationError(req);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { requestId } = req.params;
    const teamLeaderId = req.user.id;

    try {
      const request = await advisorRequestService.cancelAdvisorRequest({
        requestId: parseInt(requestId, 10),
        teamLeaderId,
      });

      return res.status(200).json({
        id: request.id,
        status: request.status,
      });
    } catch (error) {
      if (error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }
      console.error('Error cancelling advisor request:', error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    }
  },
];

module.exports = {
  validateAdvisorRequest,
  createAdvisorRequest,
  getAdvisorRequestsByGroup,
  getIncomingRequests,
  updateAdvisorRequestStatus,
  cancelAdvisorRequest,
};
