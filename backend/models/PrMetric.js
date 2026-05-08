const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const IntegrationBinding = require('./IntegrationBinding');

const PrMetric = sequelize.define(
  'PrMetric',
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
    prNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isInt: true,
        min: 1,
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
    tableName: 'PrMetrics',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['teamId', 'sprintId', 'prNumber', 'metricName'],
      },
      {
        fields: ['teamId', 'sprintId'],
      },
      {
        fields: ['teamId', 'sprintId', 'prNumber'],
      },
    ],
  },
);

IntegrationBinding.hasMany(PrMetric, {
  foreignKey: 'teamId',
  sourceKey: 'teamId',
  as: 'prMetrics',
});
PrMetric.belongsTo(IntegrationBinding, {
  foreignKey: 'teamId',
  targetKey: 'teamId',
  as: 'teamIntegration',
});

module.exports = PrMetric;
