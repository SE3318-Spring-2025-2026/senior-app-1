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
  memberIds: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
});

module.exports = Group;

