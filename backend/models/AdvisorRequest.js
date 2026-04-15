const { DataTypes, Model } = require('sequelize');
const sequelize = require('../db');

const STATUS_ENUM = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

class AdvisorRequest extends Model {}

AdvisorRequest.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  advisorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  teamLeaderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM(...STATUS_ENUM),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  decisionNote: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'AdvisorRequest',
  tableName: 'AdvisorRequests',
  timestamps: true,
});

module.exports = AdvisorRequest;
