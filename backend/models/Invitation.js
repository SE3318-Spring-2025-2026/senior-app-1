const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');
const User = require('./User');

const Invitation = sequelize.define(
  'Invitation',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Group,
        key: 'id',
      },
    },
    inviteeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
  },
  {
    indexes: [
      {
        // Duplicate-prevention: one active invitation per (group, invitee) pair.
        // Strategy: DB unique constraint → SequelizeUniqueConstraintError → 400.
        // Chosen over pre-check to avoid TOCTOU races; over ignore-duplicates to
        // give callers a deterministic, actionable error.
        unique: true,
        fields: ['groupId', 'inviteeId'],
        name: 'invitations_groupId_inviteeId_unique',
      },
    ],
  }
);

Group.hasMany(Invitation, { foreignKey: 'groupId' });
Invitation.belongsTo(Group, { foreignKey: 'groupId' });

User.hasMany(Invitation, { foreignKey: 'inviteeId' });
Invitation.belongsTo(User, { foreignKey: 'inviteeId' });

module.exports = Invitation;
