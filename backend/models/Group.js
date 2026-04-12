const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Group = sequelize.define(
  'Group',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    groupName: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('name');
      },
      set(value) {
        this.setDataValue('name', value);
      },
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
    members: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('memberIds') || [];
      },
      set(value) {
        this.setDataValue('memberIds', Array.isArray(value) ? value : []);
      },
    },
    maxMembers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4,
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
