const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  leaderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  memberIds: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },
  advisorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'DISBANDED'),
    defaultValue: 'ACTIVE',
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = Group;
