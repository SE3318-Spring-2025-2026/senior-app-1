const { AuditLog, User } = require('../models');

async function listAuditLogs(req, res) {
  const rawLimit = Number.parseInt(String(req.query.limit || '100'), 10);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 250) : 100;
  const where = {};

  if (req.query.action) {
    where.action = String(req.query.action).trim();
  }
  if (req.query.targetType) {
    where.targetType = String(req.query.targetType).trim();
  }
  if (req.query.actorId) {
    const actorId = Number.parseInt(String(req.query.actorId), 10);
    if (Number.isInteger(actorId)) where.actorId = actorId;
  }

  try {
    const rows = await AuditLog.findAll({
      where,
      include: [
        {
          model: User,
          attributes: ['id', 'fullName', 'email', 'role', 'studentId'],
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
