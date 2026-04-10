const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Invitation = sequelize.define('Invitation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
    defaultValue: 'PENDING',
    allowNull: false,
  },
}, {
  tableName: 'invitations',
  timestamps: true,
});

module.exports = Invitation;