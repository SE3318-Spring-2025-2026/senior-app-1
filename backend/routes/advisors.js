const express = require('express');
const { Op } = require('sequelize');
const { authenticate, authorize } = require('../middleware/auth');
const { AdvisorRequest, Group, Notification } = require('../models');

const router = express.Router();

function parsePayload(rawPayload) {
  try {
    return JSON.parse(rawPayload || '{}');
  } catch {
    return {};
  }
}

router.get(
  '/notifications/advisee-requests',
  authenticate,
  authorize(['PROFESSOR']),
  async (req, res) => {
    try {
      const rows = await Notification.findAll({
        where: {
          userId: req.user.id,
          type: {
            [Op.in]: ['ADVISEE_REQUEST', 'ADVISOR_REQUEST'],
          },
        },
        order: [['createdAt', 'DESC']],
        limit: 50,
      });

      const requestIds = rows
        .map((row) => parsePayload(row.payload).requestId)
        .filter(Boolean);

      const advisorRequests = requestIds.length > 0
        ? await AdvisorRequest.findAll({
          where: {
            id: {
              [Op.in]: requestIds,
            },
          },
        })
        : [];

      const advisorRequestMap = new Map(
        advisorRequests.map((request) => [String(request.id), request]),
      );

      const notifications = rows.map((row) => {
        const payload = parsePayload(row.payload);
        const request = payload.requestId ? advisorRequestMap.get(String(payload.requestId)) : null;

        return {
          id: row.id,
          type: 'ADVISEE_REQUEST',
          recipientId: req.user.id,
          requestId: payload.requestId ?? null,
          groupId: request?.groupId ?? payload.groupId ?? null,
          groupName: payload.groupName ?? null,
          requestStatus: request?.status || payload.requestStatus || payload.status || 'PENDING',
          message: payload.message || 'A team leader submitted an advisor request.',
          read: false,
          createdAt: row.createdAt,
          status: row.status,
          note: request?.note ?? null,
          decidedAt: request?.decidedAt ?? null,
        };
      });

      return res.status(200).json(notifications);
    } catch (error) {
      console.error('Error in advisors/notifications/advisee-requests:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.get(
  '/notifications/group-transfers',
  authenticate,
  authorize(['PROFESSOR']),
  async (req, res) => {
    try {
      const rows = await Notification.findAll({
        where: {
          userId: req.user.id,
          type: 'GROUP_TRANSFER',
        },
        order: [['createdAt', 'DESC']],
        limit: 50,
      });

      const groupIds = rows
        .map((row) => parsePayload(row.payload).groupId)
        .filter(Boolean);

      const groups = groupIds.length > 0
        ? await Group.findAll({
          where: {
            id: {
              [Op.in]: groupIds,
            },
          },
        })
        : [];

      const groupMap = new Map(groups.map((group) => [String(group.id), group]));

      const notifications = rows.map((row) => {
        const payload = parsePayload(row.payload);
        const group = payload.groupId ? groupMap.get(String(payload.groupId)) : null;

        return {
          id: row.id,
          type: 'GROUP_TRANSFER',
          recipientId: req.user.id,
          groupId: payload.groupId ?? null,
          groupName: payload.groupName ?? group?.name ?? null,
          message: payload.message || 'A new group has been assigned to you through transfer.',
          read: false,
          createdAt: row.createdAt,
          status: row.status,
        };
      });

      return res.status(200).json(notifications);
    } catch (error) {
      console.error('Error in advisors/notifications/group-transfers:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

module.exports = router;
