const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const IntegrationBinding = require('./IntegrationBinding');

const SprintStory = sequelize.define(
  'SprintStory',
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
    issueKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assigneeId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reporterId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    storyPoints: {
      type: DataTypes.FLOAT,
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
  },
  {
    tableName: 'SprintStories',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['teamId', 'sprintId', 'issueKey'],
      },
      {
        fields: ['teamId', 'sprintId'],
      },
    ],
  },
);

IntegrationBinding.hasMany(SprintStory, {
  foreignKey: 'teamId',
  sourceKey: 'teamId',
  as: 'sprintStories',
});
SprintStory.belongsTo(IntegrationBinding, {
  foreignKey: 'teamId',
  targetKey: 'teamId',
  as: 'teamIntegration',
});

module.exports = SprintStory;
