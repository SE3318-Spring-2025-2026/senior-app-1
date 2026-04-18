const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getPendingAdvisorRequest,
  updatePendingAdvisorRequestStatus,
} = require('../controllers/advisorRequestController');
const { AdvisorRequest, AuditLog, Group } = require('../models');

const router = express.Router();

const buildErrorResponse = (message, code) => ({ message, code });

router.get(
  '/pending-advisor-requests/:requestId',
  authenticate,
  authorize(['PROFESSOR']),
  getPendingAdvisorRequest,
);

router.patch(
  '/pending-advisor-requests/:requestId/status',
  authenticate,
  authorize(['PROFESSOR']),
  body('status').isString().trim().notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        buildErrorResponse('Status is required.', 'INVALID_STATUS_TRANSITION'),
      );
    }

    return updatePendingAdvisorRequestStatus(req, res, next);
  },
);

router.patch(
  '/advisor-requests/:requestId/decision',
  authenticate,
  authorize(['PROFESSOR']),
  body('decision')
    .isString()
    .trim()
    .custom((value) => ['APPROVE', 'REJECT'].includes(String(value).toUpperCase())),
  body('note').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        buildErrorResponse('Decision must be APPROVE or REJECT.', 'INVALID_DECISION'),
      );
    }

    try {
      const request = await AdvisorRequest.findByPk(req.params.requestId);
      if (!request) {
        return res.status(404).json(
          buildErrorResponse('Advisor request not found.', 'REQUEST_NOT_FOUND'),
        );
      }

      if (String(request.advisorId) !== String(req.user.id)) {
        return res.status(403).json(
          buildErrorResponse('Only the assigned advisor can decide this request.', 'FORBIDDEN'),
        );
      }

      if (request.status !== 'PENDING') {
        return res.status(400).json(
          buildErrorResponse('Advisor request has already been decided.', 'REQUEST_ALREADY_RESOLVED'),
        );
      }

      const normalizedDecision = String(req.body.decision).toUpperCase();
      const nextStatus = normalizedDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const note = typeof req.body.note === 'string' ? req.body.note.trim() : null;

      if (normalizedDecision === 'APPROVE') {
        const group = await Group.findByPk(request.groupId);
        if (!group) {
          return res.status(404).json(
            buildErrorResponse('Group not found for this advisor request.', 'GROUP_NOT_FOUND'),
          );
        }

        await group.update({
          advisorId: String(req.user.id),
        });
      }

      await request.update({
        status: nextStatus,
        note: note || null,
        decidedAt: new Date(),
      });

      await AuditLog.create({
        action: nextStatus === 'APPROVED' ? 'ADVISOR_REQUEST_APPROVED' : 'ADVISOR_REQUEST_REJECTED',
        actorId: req.user.id,
        targetType: 'ADVISOR_REQUEST',
        targetId: request.id,
        metadata: {
          groupId: request.groupId,
          advisorId: request.advisorId,
          decision: normalizedDecision,
          note: note || null,
        },
      });

      return res.status(200).json({
        id: request.id,
        groupId: request.groupId,
        advisorId: request.advisorId,
        teamLeaderId: request.teamLeaderId,
        status: request.status,
        note: request.note,
        decidedAt: request.decidedAt,
        message: nextStatus === 'APPROVED'
          ? 'Advisor request approved successfully.'
          : 'Advisor request rejected successfully.',
      });
    } catch (error) {
      console.error('Error in advisor request decision route:', error);
      return res.status(500).json(
        buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR'),
      );
    }
  },
);

module.exports = router;
