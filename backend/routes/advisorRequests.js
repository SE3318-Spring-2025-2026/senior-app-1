const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const NotificationService = require('../services/notificationService');
const {
  getPendingAdvisorRequest,
  updatePendingAdvisorRequestStatus,
  listAdvisorRequests, // Senin yazdığın controller metodu eklendi
} = require('../controllers/advisorRequestController');
const { AdvisorRequest, AuditLog, Group, User } = require('../models');

const router = express.Router();

const buildErrorResponse = (message, code) => ({ message, code });

// 1. Senin Dalından Gelen: Çoğul İstekleri Listeleme (Ekibin güvenlik katmanlarıyla güçlendirildi)
router.get(
  '/advisor-requests',
  authenticate,
  authorize(['PROFESSOR']),
  listAdvisorRequests
);

// 2. Ana Daldan Gelen: Tekil İstek Getirme
router.get(
  '/pending-advisor-requests/:requestId',
  authenticate,
  authorize(['PROFESSOR']),
  getPendingAdvisorRequest,
);

// 3. Ana Daldan Gelen: Durum Güncelleme (Controller'a yönlendirilen versiyon)
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

// 4. Ana Daldan Gelen: Karar Verme 
// (Not: Bu kadar iş mantığının route içinde olması hatalıdır, takımın yazdığı loglama/bildirimleri bozmamak için şimdilik tutuluyor)
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
      const group = await Group.findByPk(request.groupId);

      if (normalizedDecision === 'APPROVE') {
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

      const advisorUser = await User.findByPk(req.user.id, {
        attributes: ['id', 'fullName', 'email'],
      });

      if (request.teamLeaderId) {
        await NotificationService.notifyTeamLeaderAdvisorDecision({
          leaderId: request.teamLeaderId,
          requestId: request.id,
          groupId: request.groupId,
          groupName: group?.name || null,
          advisorDecision: nextStatus,
          advisorId: advisorUser?.id ?? req.user.id,
          advisorName: advisorUser?.fullName ?? null,
          advisorEmail: advisorUser?.email ?? null,
          message: group?.name
            ? `Advisor request for ${group.name} was ${nextStatus.toLowerCase()}.`
            : `Your advisor request was ${nextStatus.toLowerCase()}.`,
        });
      }

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