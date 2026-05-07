const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');

async function listAuditLogs(req, res) {
  const rawLimit = Number.parseInt(String(req.query.limit || '100'), 10);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 250) : 100;

  const where = {};
  if (req.query.action) {
    where.action = req.query.action;
  }
  if (req.query.actorId) {
    const parsed = Number.parseInt(String(req.query.actorId), 10);
    if (Number.isInteger(parsed)) where.actorId = parsed;
  }
  if (req.query.targetType) {
    where.targetType = req.query.targetType;
  }
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt[Op.gte] = new Date(req.query.from);
    if (req.query.to) where.createdAt[Op.lte] = new Date(req.query.to);
  }

  try {
    const rows = await AuditLog.findAll({
      where,
      include: [
        {
          model: User,
          attributes: ['id', 'fullName', 'email', 'role', 'studentId'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });

    return res.status(200).json({
      count: rows.length,
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata || {},
        createdAt: row.createdAt,
        actor: row.User ? {
          id: row.User.id,
          fullName: row.User.fullName,
          email: row.User.email,
          role: row.User.role,
          studentId: row.User.studentId || null,
        } : null,
      })),
    });
  } catch (error) {
    console.error('Audit log listing failed unexpectedly:', error);
    return res.status(500).json({
      code: 'AUDIT_LOG_FETCH_FAILED',
      message: 'Audit logs could not be loaded.',
    });
  }
}

module.exports = {
  listAuditLogs,
};
