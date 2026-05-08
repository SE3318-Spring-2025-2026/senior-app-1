const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const IntegrationBinding = require('./IntegrationBinding');

const StoryMetric = sequelize.define(
  'StoryMetric',
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
      validate: {
        notEmpty: true,
      },
    },
    sprintId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    issueKey: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    metricName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    metricValue: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: {
        isFloat: true,
        min: 0,
      },
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
  },
  {
    tableName: 'StoryMetrics',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['teamId', 'sprintId', 'issueKey', 'metricName'],
      },
      {
        fields: ['teamId', 'sprintId'],
      },
      {
        fields: ['teamId', 'sprintId', 'issueKey'],
      },
    ],
  },
);

IntegrationBinding.hasMany(StoryMetric, {
  foreignKey: 'teamId',
  sourceKey: 'teamId',
  as: 'storyMetrics',
});
StoryMetric.belongsTo(IntegrationBinding, {
  foreignKey: 'teamId',
  targetKey: 'teamId',
  as: 'teamIntegration',
});

module.exports = StoryMetric;
