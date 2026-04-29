const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const IntegrationTokenReference = sequelize.define(
  'IntegrationTokenReference',
  {
    teamId: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    githubTokenRef: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    jiraTokenRef: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'IntegrationTokenReferences',
    timestamps: true,
  },
);

module.exports = IntegrationTokenReference;
