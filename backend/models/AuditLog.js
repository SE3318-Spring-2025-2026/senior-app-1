/**
 * models/AuditLog.js
 *
 * Unified Audit Log Model
 * - Append-only (immutable)
 * - Supports all domain events
 * - Flexible metadata storage
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    /**
     * Action key (extendable vocabulary)
     * Examples:
     *  - GROUP_CREATED
     *  - INVITATION_ACCEPTED
     *  - INVITATION_REJECTED
     *  - MEMBERSHIP_UPDATED
     *  - ADVISOR_RELEASE
     */
    action: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },

    /**
     * User who triggered the action
     */
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },

    /**
     * Entity type (GROUP, INVITATION, MEMBERSHIP, etc.)
     */
    targetType: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },

    /**
     * Primary key of the affected entity
     */
    targetId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    /**
     * Flexible JSON metadata
     * Example:
     * { groupId, groupName, invitedUserId }
     */
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'AuditLogs',
    timestamps: true,
    updatedAt: false, // immutable log
  }
);

// Associations
User.hasMany(AuditLog, { foreignKey: 'actorId' });
AuditLog.belongsTo(User, { foreignKey: 'actorId' });

module.exports = AuditLog;