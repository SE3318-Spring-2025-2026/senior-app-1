const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const FinalEvaluationWeight = sequelize.define(
  'FinalEvaluationWeight',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    advisorWeight: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    committeeWeight: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'FinalEvaluationWeights',
    timestamps: true,
  }
);

module.exports = FinalEvaluationWeight;
