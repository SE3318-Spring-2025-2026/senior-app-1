/**
 * Notification model — D9
 *
 * Stores one row per queued/sent/failed notification.
 * The `payload` column holds a JSON string so the schema stays flexible
 * while SQLite (which has no native JSON column) remains supported.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Notification = sequelize.define(
  'Notification',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    /** Recipient user ID (FK → Users.id, enforced at app layer) */
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    /**
     * Notification type key.
     * Known values: 'GROUP_INVITE', 'ADVISOR_RELEASED'
     * Kept as a plain string so new types require no migration.
     */
    type: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },

    /**
     * JSON-encoded payload.
     * For GROUP_INVITE: { invitationId: number, groupId: number }
     */
    payload: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}',
    },

    /**
     * Delivery lifecycle:
     *   PENDING  – persisted, not yet pushed
     *   SENT     – successfully pushed to client
     *   FAILED   – push failed; eligible for retry job
     */
    status: {
      type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },

    /** Timestamp when the notification was successfully delivered */
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    /** Number of delivery attempts made so far */
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    /** Last error message recorded by flagForRetry */
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'Notifications',
    timestamps: true, // createdAt, updatedAt
  },
);

module.exports = Notification;
