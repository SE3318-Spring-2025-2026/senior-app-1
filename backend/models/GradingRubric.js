const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const GradingRubric = sequelize.define(
  'GradingRubric',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
      unique: true,
    },
    // JSON array of { id, question, criterionType, maxPoints, weight }
    criteria: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    tableName: 'GradingRubrics',
    timestamps: true,
  }
);

module.exports = GradingRubric;
