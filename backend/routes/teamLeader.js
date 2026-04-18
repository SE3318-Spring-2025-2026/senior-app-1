const express = require('express');
const { Op } = require('sequelize');
const { authenticate, authorize } = require('../middleware/auth');
const { Group, Professor, Notification, User } = require('../models');

const router = express.Router();

function parsePayload(rawPayload) {
  try {
    return JSON.parse(rawPayload || '{}');
  } catch {
    return {};
  }
}

router.get(
  '/notifications/advisor-transfers',
  authenticate,
  authorize(['STUDENT']),
  async (req, res) => {
    try {
      const rows = await Notification.findAll({
        where: {
          userId: req.user.id,
          type: 'ADVISOR_TRANSFER',
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

      const advisorIds = [...new Set(
        rows
          .map((row) => {
            const payload = parsePayload(row.payload);
            return payload.newAdvisorId ?? groupMap.get(String(payload.groupId))?.advisorId ?? null;
          })
          .filter(Boolean)
          .map((value) => Number.parseInt(String(value), 10))
          .filter((value) => Number.isInteger(value) && value > 0),
      )];

      const professors = advisorIds.length > 0
        ? await Professor.findAll({
          where: {
            userId: {
              [Op.in]: advisorIds,
            },
          },
          include: [
            {
              model: User,
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        })
        : [];

      const professorMap = new Map(
        professors
          .filter((professor) => professor.User)
          .map((professor) => [String(professor.userId), professor]),
      );

      const notifications = rows.map((row) => {
        const payload = parsePayload(row.payload);
        const group = payload.groupId ? groupMap.get(String(payload.groupId)) : null;
        const advisorUserId = String(payload.newAdvisorId ?? group?.advisorId ?? '');
        const professor = professorMap.get(advisorUserId);

        return {
          id: row.id,
          type: 'ADVISOR_TRANSFER',
          recipientId: req.user.id,
          groupId: payload.groupId ?? null,
          groupName: payload.groupName ?? group?.name ?? null,
          message: payload.message || 'Your group advisor has been changed through a transfer.',
          createdAt: row.createdAt,
          status: row.status,
          newAdvisor: {
            id: professor?.User?.id ?? payload.newAdvisorId ?? null,
            fullName: payload.newAdvisorName ?? professor?.User?.fullName ?? null,
            email: payload.newAdvisorEmail ?? professor?.User?.email ?? null,
            department: payload.newAdvisorDepartment ?? professor?.department ?? null,
          },
        };
      });

      return res.status(200).json(notifications);
    } catch (error) {
      console.error('Error in team-leader/notifications/advisor-transfers:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

module.exports = router;
