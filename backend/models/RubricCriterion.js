const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const RubricCriterion = sequelize.define(
  'RubricCriterion',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },
    question: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    criterionType: {
      type: DataTypes.ENUM('BINARY', 'SOFT'),
      allowNull: false,
    },
    maxPoints: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
  },
  {
    tableName: 'RubricCriteria',
    timestamps: true,
    indexes: [{ unique: true, fields: ['question', 'deliverableType'] }],
  }
);

module.exports = RubricCriterion;
