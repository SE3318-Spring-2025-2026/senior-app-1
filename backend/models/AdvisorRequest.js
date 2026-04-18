const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const AdvisorRequest = sequelize.define(
  'AdvisorRequest',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    advisorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    teamLeaderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    decidedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'AdvisorRequests',
    timestamps: true,
  },
);

module.exports = AdvisorRequest;
