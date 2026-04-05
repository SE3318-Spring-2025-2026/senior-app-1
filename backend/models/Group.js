const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  normalizedName: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  leaderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  memberIds: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  advisorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

module.exports = Group;

