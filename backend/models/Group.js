const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Group = sequelize.define(
  'Group',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    leaderId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    maxMembers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4,
      validate: {
        min: 1,
        max: 10,
      },
    },
    status: {
      type: DataTypes.ENUM('FORMATION', 'HAS_ADVISOR', 'LOOKING_FOR_ADVISOR', 'FINALIZED', 'DISBANDED'),
      allowNull: false,
      defaultValue: 'FORMATION',
    },
    memberIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    advisorId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'Groups',
    timestamps: true,
  },
);

module.exports = Group;
