'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const AIValidationResult = sequelize.define(
  'AIValidationResult',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    teamId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sprintId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    issueKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    prNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    validationStatus: {
      type: DataTypes.ENUM('MATCHED', 'PARTIAL_MATCH', 'NOT_MATCHED', 'AI_UNAVAILABLE', 'AI_ERROR', 'AI_PARSE_ERROR'),
      allowNull: false,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    requestedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    validatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'AIValidationResults',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['teamId', 'sprintId', 'issueKey'] },
      { fields: ['teamId', 'sprintId'] },
    ],
  },
);

module.exports = AIValidationResult;
