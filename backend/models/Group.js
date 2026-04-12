const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/**
 * D2 Group — supports coordinator overrides (memberIds) and formation flow (maxMembers, status).
 */
const Group = sequelize.define(
  'Group',
  {
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
      type: DataTypes.STRING,
      allowNull: true,
    },
    memberIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    maxMembers: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'FORMATION',
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
