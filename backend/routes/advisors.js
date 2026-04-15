const express = require('express');
const { Op } = require('sequelize');
const { authenticate, authorize } = require('../middleware/auth');
const { Notification } = require('../models');

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

      const notifications = rows.map((row) => {
        const payload = parsePayload(row.payload);

        return {
          id: row.id,
          type: 'ADVISEE_REQUEST',
          recipientId: req.user.id,
          requestId: payload.requestId ?? null,
          groupId: payload.groupId ?? null,
          groupName: payload.groupName ?? null,
          requestStatus: payload.requestStatus || payload.status || 'PENDING',
          message: payload.message || 'A team leader submitted an advisor request.',
          read: false,
          createdAt: row.createdAt,
          status: row.status,
        };
      });

      return res.status(200).json(notifications);
    } catch (error) {
      console.error('Error in advisors/notifications/advisee-requests:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

module.exports = router;
