/**
 * Invitation model — D8
 *
 * Stores one row per group invitation (pending, accepted, declined, expired).
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Invitation = sequelize.define(
  'Invitation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    /** Group being joined */
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    /** Invited student's user ID */
    inviteeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    /** User who sent the invitation */
    inviterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    /**
     * Invitation lifecycle status.
     *   PENDING   – awaiting invitee response
     *   ACCEPTED  – invitee joined the group
     *   DECLINED  – invitee rejected
     *   EXPIRED   – invitation window closed
     */
    status: {
      type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
  },
  {
    tableName: 'Invitations',
    timestamps: true, // createdAt, updatedAt

    indexes: [
      {
        // Prevents duplicate active invitations for the same (group, invitee).
        unique: true,
        fields: ['groupId', 'inviteeId'],
        where: { status: 'PENDING' },
        name: 'unique_pending_invitation',
      },
    ],
  },
);

module.exports = Invitation;
