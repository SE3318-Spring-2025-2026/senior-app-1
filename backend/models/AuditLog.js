const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  actorId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  targetId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});

module.exports = AuditLog;

