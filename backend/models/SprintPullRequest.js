const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const IntegrationBinding = require('./IntegrationBinding');

const SprintPullRequest = sequelize.define(
  'SprintPullRequest',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    teamId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'IntegrationBindings',
        key: 'teamId',
      },
    },
    sprintId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    prNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    relatedIssueKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    branchName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    prStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mergeStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    changedFiles: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    diffSummary: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    sourceCreatedAt: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sourceUpdatedAt: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sourceMergedAt: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    staleAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'SprintPullRequests',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['teamId', 'sprintId', 'prNumber'],
      },
      {
        fields: ['teamId', 'sprintId'],
      },
      {
        fields: ['teamId', 'sprintId', 'relatedIssueKey'],
      },
      {
        fields: ['teamId', 'sprintId', 'isActive'],
      },
    ],
  },
);

IntegrationBinding.hasMany(SprintPullRequest, {
  foreignKey: 'teamId',
  sourceKey: 'teamId',
  as: 'sprintPullRequests',
});
SprintPullRequest.belongsTo(IntegrationBinding, {
  foreignKey: 'teamId',
  targetKey: 'teamId',
  as: 'teamIntegration',
});

module.exports = SprintPullRequest;
