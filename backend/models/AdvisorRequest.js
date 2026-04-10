const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');
const User = require('./User');
const Professor = require('./Professor');

const AdvisorRequest = sequelize.define('AdvisorRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Group,
      key: 'id',
    },
  },
  professorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Professor,
      key: 'id',
    },
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'),
    defaultValue: 'PENDING',
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

// Associations
Group.hasMany(AdvisorRequest, { foreignKey: 'groupId' });
AdvisorRequest.belongsTo(Group, { foreignKey: 'groupId' });

Professor.hasMany(AdvisorRequest, { foreignKey: 'professorId' });
AdvisorRequest.belongsTo(Professor, { foreignKey: 'professorId' });

module.exports = AdvisorRequest;
