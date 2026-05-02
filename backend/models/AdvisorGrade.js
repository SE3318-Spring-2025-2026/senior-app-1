/**
 * models/AdvisorGrade.js
 *
 * Stores advisor soft grades for group deliverables.
 * One grade per (groupId, deliverableId, advisorId) tuple.
 * Advisor soft grades are submitted by the assigned advisor before committee review.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');
const Deliverable = require('./Deliverable');
const User = require('./User');

const AdvisorGrade = sequelize.define(
  'AdvisorGrade',
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
    advisorId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'User ID of the assigned advisor',
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
    tableName: 'AdvisorGrades',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['groupId', 'deliverableId', 'advisorId'],
      },
    ],
  }
);

// Associations
AdvisorGrade.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
AdvisorGrade.belongsTo(Deliverable, { foreignKey: 'deliverableId', as: 'deliverable' });
AdvisorGrade.belongsTo(User, { foreignKey: 'advisorId', as: 'advisor' });

module.exports = AdvisorGrade;
