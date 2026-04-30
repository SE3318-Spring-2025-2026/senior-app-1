const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const FinalEvaluationGrade = sequelize.define(
  'FinalEvaluationGrade',
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
    gradeType: {
      type: DataTypes.ENUM('ADVISOR', 'COMMITTEE'),
      allowNull: false,
    },
    gradedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    scores: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    finalScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'FinalEvaluationGrades',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['groupId', 'gradeType', 'gradedBy'],
      },
    ],
  }
);

module.exports = FinalEvaluationGrade;
