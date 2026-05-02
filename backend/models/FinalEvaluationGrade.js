/**
 * models/FinalEvaluationGrade.js
 *
 * Stores committee member grades for final evaluation of group deliverables.
 * One grade per (groupId, deliverableId, submittedBy) tuple.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');
const Deliverable = require('./Deliverable');
const User = require('./User');

const FinalEvaluationGrade = sequelize.define(
  'FinalEvaluationGrade',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Groups',
        key: 'id',
      },
    },
    deliverableId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Deliverables',
        key: 'id',
      },
    },
    submittedBy: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'User ID of the committee member (PROFESSOR)',
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
    tableName: 'FinalEvaluationGrades',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['groupId', 'deliverableId', 'submittedBy'],
      },
    ],
  }
);

// Associations
FinalEvaluationGrade.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
FinalEvaluationGrade.belongsTo(Deliverable, { foreignKey: 'deliverableId', as: 'deliverable' });
FinalEvaluationGrade.belongsTo(User, { foreignKey: 'submittedBy', as: 'reviewer' });

module.exports = FinalEvaluationGrade;
