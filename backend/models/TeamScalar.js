const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const TeamScalar = sequelize.define(
  'TeamScalar',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    scalar: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    advisorFinalScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    committeeFinalScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    weightConfigId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    calculatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'TeamScalars',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['groupId'],
      },
    ],
  }
);

module.exports = TeamScalar;
