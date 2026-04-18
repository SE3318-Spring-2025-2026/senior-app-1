const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const AdvisorRequest = sequelize.define('AdvisorRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  professorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  teamLeaderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
    defaultValue: 'PENDING',
  },
  decisionNote: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  uniqueKeys: {
    unique_group_professor: {
      fields: ['groupId', 'professorId'],
    },
  },
});

module.exports = AdvisorRequest;
