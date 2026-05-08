const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const SprintWeightConfiguration = sequelize.define(
  'SprintWeightConfiguration',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
      unique: true,
    },
    sprintWeights: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'SprintWeightConfigurations',
    timestamps: true,
  }
);

module.exports = SprintWeightConfiguration;
