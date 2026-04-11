const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  groupName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 255],
    },
  },
  leaderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the team leader who created the group',
  },
  members: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    comment: 'Array of student IDs (11-digit strings)',
  },
  status: {
    type: DataTypes.ENUM('FORMATION', 'ACTIVE', 'COMPLETED', 'FINALIZED', 'DISBANDED'),
    allowNull: false,
    defaultValue: 'FORMATION',
  },
  maxMembers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    validate: {
      min: 1,
      max: 10,
    },
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'Groups',
  timestamps: true,
});

module.exports = Group;
