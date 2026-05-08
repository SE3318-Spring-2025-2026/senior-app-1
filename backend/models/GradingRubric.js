const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const GradingRubric = sequelize.define(
  'GradingRubric',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },
    criteria: {
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
    tableName: 'GradingRubrics',
    timestamps: true,
    indexes: [{ unique: true, fields: ['deliverableType'] }],
  }
);

module.exports = GradingRubric;
