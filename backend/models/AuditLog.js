const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

/**
 * AuditLog — D6 (Audit Logs)
 *
 * One row per auditable action. Schema is intentionally generic so every
 * future event (GROUP_CREATED, INVITATION_ACCEPTED, MEMBERSHIP_UPDATED, …)
 * fits without migration.
 *
 * Action vocabulary (append-only):
 *   GROUP_CREATED       — group shell written to D2 (P21)
 *   INVITATION_ACCEPTED — invitee accepts a pending invitation (P23)
 *   MEMBERSHIP_UPDATED  — coordinator manually edits membership (P25)
 */
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  action: {
    // Machine-readable verb from the action vocabulary above.
    type: DataTypes.STRING,
    allowNull: false,
  },
  actorId: {
    // User who triggered the action.
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  targetId: {
    // PK of the primary entity affected (e.g. group UUID).
    type: DataTypes.STRING,
    allowNull: false,
  },
  targetType: {
    // Entity type string (e.g. 'GROUP', 'INVITATION').
    type: DataTypes.STRING,
    allowNull: false,
  },
  metadata: {
    // Free-form JSON for action-specific context (e.g. { groupName }).
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
});

User.hasMany(AuditLog, { foreignKey: 'actorId' });
AuditLog.belongsTo(User, { foreignKey: 'actorId' });

module.exports = AuditLog;
