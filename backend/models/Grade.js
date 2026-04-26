/**
 * models/Grade.js
 *
 * Stores grading decisions made by committee members for deliverables.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');
const Deliverable = require('./Deliverable');

const Grade = sequelize.define(
  'Grade',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    deliverableId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Deliverables',
        key: 'id',
      },
    },
    gradedBy: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'User ID of the grader (committee member)',
    },
    gradeType: {
      type: DataTypes.ENUM('ADVISOR_SOFT', 'COMMITTEE_FINAL', 'PEER_REVIEW'),
      allowNull: false,
    },
    scores: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of {criterionId, value, note}',
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'Grades',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['deliverableId', 'gradedBy'],
      },
    ],
  }
);

// Associations
Grade.belongsTo(Deliverable, { foreignKey: 'deliverableId', as: 'deliverable' });
Grade.belongsTo(User, { foreignKey: 'gradedBy', as: 'grader' });

module.exports = Grade;
