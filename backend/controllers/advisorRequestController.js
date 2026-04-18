const crypto = require('crypto');
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const { AdvisorRequest, Group, Professor, User } = require('../models');
const { processDecision } = require('../services/advisorRequestService');
const NotificationService = require('../services/notificationService');

const buildErrorResponse = (message, code) => ({
  message,
  code,
});

function formatValidationErrors(errors) {
  const fieldErrors = {};

  errors.array().forEach((error) => {
    const fieldName = error.path || error.param || 'general';
    if (!fieldErrors[fieldName]) {
      fieldErrors[fieldName] = [];
    }
    fieldErrors[fieldName].push(error.msg);
  });

  return fieldErrors;
}

const createAdvisorRequest = [
  body('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
  body('advisorId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Advisor selection must be a positive integer')
    .toInt(),
  body('professorId')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Advisor selection must be a positive integer')
    .toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    const requestedAdvisorId = req.body.advisorId ?? req.body.professorId;
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Please check your input and try again',
        errors: formatValidationErrors(errors),
      });
    }

    if (!requestedAdvisorId) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Please check your input and try again',
        errors: {
          advisorId: ['Advisor is required'],
        },
      });
    }

    const { groupId } = req.body;
    const advisorId = requestedAdvisorId;

    try {
      const group = await Group.findByPk(groupId);
      if (!group) {
        return res.status(400).json({
          code: 'GROUP_NOT_FOUND',
          message: 'Please check your input and try again',
          errors: {
            groupId: ['The specified group does not exist'],
          },
        });
      }

      if (String(group.leaderId || '') !== String(req.user.id)) {
        return res.status(403).json(
          buildErrorResponse('Only the team leader can submit advisor requests for this group.', 'FORBIDDEN'),
        );
      }

      const advisor = await Professor.findOne({
        where: { userId: advisorId },
        include: [{ model: User, attributes: ['id', 'fullName', 'email', 'role'] }],
      });

      if (!advisor || advisor.User?.role !== 'PROFESSOR') {
        return res.status(400).json({
          code: 'ADVISOR_NOT_FOUND',
          message: 'Please check your input and try again',
          errors: {
            advisorId: ['The selected advisor does not exist'],
          },
        });
      }

      const existingRequest = await AdvisorRequest.findOne({
        where: {
          groupId,
          advisorId,
          status: 'PENDING',
        },
      });

      if (existingRequest) {
        return res.status(409).json({
          code: 'REQUEST_ALREADY_EXISTS',
          message: 'An advisor request already exists for this group and advisor',
          errors: {
            groupId: ['An advisor request already exists for this group and advisor'],
          },
        });
      }

      const existingApprovedRequest = await AdvisorRequest.findOne({
        where: {
          groupId,
          advisorId,
          status: 'APPROVED',
        },
        order: [['updatedAt', 'DESC']],
      });

      if (existingApprovedRequest && String(group.advisorId || '') === String(advisorId)) {
        return res.status(409).json({
          code: 'REQUEST_ALREADY_EXISTS',
          message: 'An advisor request already exists for this group and advisor',
          errors: {
            groupId: ['An advisor request already exists for this group and advisor'],
          },
        });
      }

      const advisorRequest = await AdvisorRequest.create({
        id: crypto.randomUUID(),
        groupId,
        advisorId,
        teamLeaderId: req.user.id,
        status: 'PENDING',
      });

      await NotificationService.notifyAdvisorRequestReceived({
        advisorId,
        requestId: advisorRequest.id,
        groupId,
        groupName: group.name,
        teamLeaderId: req.user.id,
        teamLeaderName: req.user.fullName || null,
      });

      return res.status(201).json({
        id: advisorRequest.id,
        groupId: advisorRequest.groupId,
        advisorId: advisorRequest.advisorId,
        teamLeaderId: advisorRequest.teamLeaderId,
        status: advisorRequest.status,
        createdAt: advisorRequest.createdAt,
        message: 'Advisor request created successfully',
      });
    } catch (error) {
      console.error('Error creating advisor request:', error);
      return res.status(500).json(
        buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR'),
      );
    }
  },
];

async function getPendingAdvisorRequest(req, res) {
  try {
    const advisorRequest = await AdvisorRequest.findByPk(req.params.requestId);

    if (!advisorRequest) {
      return res.status(404).json(
        buildErrorResponse('Advisor request not found.', 'REQUEST_NOT_FOUND'),
      );
    }

    if (String(advisorRequest.advisorId) !== String(req.user.id)) {
      return res.status(403).json(
        buildErrorResponse('Only the assigned advisor can access this request.', 'FORBIDDEN'),
      );
    }

    if (advisorRequest.status !== 'PENDING') {
      return res.status(400).json(
        buildErrorResponse('Advisor request is not pending.', 'REQUEST_NOT_PENDING'),
      );
    }

    return res.status(200).json({
      id: advisorRequest.id,
      groupId: advisorRequest.groupId,
      advisorId: advisorRequest.advisorId,
      teamLeaderId: advisorRequest.teamLeaderId,
      status: advisorRequest.status,
      note: advisorRequest.note,
      decidedAt: advisorRequest.decidedAt,
      createdAt: advisorRequest.createdAt,
      updatedAt: advisorRequest.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching pending advisor request:', error);
    return res.status(500).json(
      buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR'),
    );
  }
}

async function listAdvisorRequests(req, res) {
  try {
    const status = req.query.status || 'PENDING';
    const advisorId = req.user.id;
    const requests = await AdvisorRequest.findAll({
      where: { status, advisorId },
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json(requests);
  } catch (error) {
    console.error('Error fetching list of advisor requests:', error);
    return res.status(500).json(
      buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR'),
    );
  }
}

async function updatePendingAdvisorRequestStatus(req, res) {
  try {
    const { requestId } = req.params;
    const advisorRequest = await AdvisorRequest.findByPk(requestId);

    if (!advisorRequest) {
      return res.status(404).json(
        buildErrorResponse('Advisor request not found.', 'REQUEST_NOT_FOUND'),
      );
    }

    if (String(advisorRequest.advisorId) !== String(req.user.id)) {
      return res.status(403).json(
        buildErrorResponse('Only the assigned advisor can update this request.', 'FORBIDDEN'),
      );
    }

    if (advisorRequest.status !== 'PENDING') {
      return res.status(400).json(
        buildErrorResponse('Advisor request is not pending.', 'REQUEST_NOT_PENDING'),
      );
    }

    const rawDecision = req.body.status || req.body.decision;
    if (!rawDecision) {
      return res.status(400).json(
        buildErrorResponse('Decision/Status is required.', 'MISSING_FIELD'),
      );
    }

    const nextStatus = String(rawDecision).toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(nextStatus)) {
      return res.status(400).json(
        buildErrorResponse('Only APPROVED or REJECTED transitions are allowed.', 'INVALID_STATUS_TRANSITION'),
      );
    }

    const result = await processDecision({
      requestId,
      decision: nextStatus,
      note: req.body.note,
      userId: req.user.id,
    });

    return res.status(200).json({ success: true, advisorRequest: result });
  } catch (error) {
    console.error('Error updating pending advisor request status:', error);
    return res.status(500).json(
      buildErrorResponse(error.message || 'Internal Server Error', 'INTERNAL_SERVER_ERROR'),
    );
  }
}

module.exports = {
  createAdvisorRequest,
  getPendingAdvisorRequest,
  listAdvisorRequests,
  updatePendingAdvisorRequestStatus,
};
