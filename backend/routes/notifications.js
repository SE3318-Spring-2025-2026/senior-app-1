const express = require('express');
const { authenticate } = require('../middleware/auth');
const { Notification } = require('../models');

const router = express.Router();

router.get('/me', authenticate, async (req, res) => {
  try {
    const rows = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const notifications = rows.map((row) => {
      let payload = {};
      try {
        payload = JSON.parse(row.payload || '{}');
      } catch {
        payload = {};
      }

      return {
        id: row.id,
        type: row.type,
        status: row.status,
        createdAt: row.createdAt,
        payload,
      };
    });

    return res.status(200).json({ notifications });
  } catch (error) {
    console.error('Error in notifications/me:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
