const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const MemberFinalGrade = sequelize.define(
  'MemberFinalGrade',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    teamScalar: {
      type: DataTypes.FLOAT,
      allowNull: false,
      comment: 'Team-level scalar score (0–100)',
    },
    contributionRatio: {
      type: DataTypes.FLOAT,
      allowNull: false,
      comment: 'Individual contribution ratio (0–100, all members sum to 100)',
    },
    finalScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
      comment: 'Computed per-member score: min(100, teamScalar * contributionRatio / 100)',
    },
    letterGrade: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
  },
  {
    tableName: 'MemberFinalGrades',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['groupId', 'userId'],
      },
    ],
  },
);

module.exports = MemberFinalGrade;
