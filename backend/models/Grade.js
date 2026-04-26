/**
 * models/Grade.js
 * 
 * Records grading decisions with scores and comments.
 * D4 Grading Storage
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Deliverable = require('./Deliverable');
const User = require('./User');

const Grade = sequelize.define(
  'Grade',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    
    /**
     * Reference to the Deliverable being graded
     */
    deliverableId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Deliverable,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    
    /**
     * Reference to the User who created this grade (professor/grader)
     */
    gradedBy: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    
    /**
     * Type of grade
     */
    gradeType: {
      type: DataTypes.ENUM('ADVISOR_SOFT', 'COMMITTEE_FINAL', 'PEER_REVIEW'),
      allowNull: false,
    },
    
    /**
     * Scores for each criterion
     * Array: { criterionId, value, note }
     */
    scores: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    
    /**
     * Optional comments from grader
     */
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

module.exports = Grade;
