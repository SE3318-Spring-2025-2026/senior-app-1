const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const IntegrationBinding = sequelize.define(
  'IntegrationBinding',
  {
    bindingId: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    teamId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    providerSet: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    organizationName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    repositoryName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    jiraWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    jiraUserEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    jiraProjectKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    defaultBranch: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    initiatedBy: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'PENDING_REAUTH', 'INVALID'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  },
  {
    tableName: 'IntegrationBindings',
    timestamps: true,
  },
);

module.exports = IntegrationBinding;
