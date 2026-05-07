'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const SprintMemberRecord = sequelize.define(
  'SprintMemberRecord',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sprintId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    storyPointsCompleted: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    commitCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'SprintMemberRecords',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['groupId', 'userId', 'sprintId'],
      },
      {
        fields: ['groupId'],
      },
    ],
  },
);

module.exports = SprintMemberRecord;
