const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const CommitteeReview = sequelize.define(
  'CommitteeReview',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    submissionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reviewerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    scores: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    finalScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
  },
  {
    tableName: 'CommitteeReviews',
    timestamps: true,
    indexes: [{ unique: true, fields: ['submissionId', 'reviewerId'] }],
  }
);

module.exports = CommitteeReview;
