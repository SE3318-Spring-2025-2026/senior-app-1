/**
 * models/GradingRubric.js
 * 
 * Defines evaluation criteria for committee grading.
 * D3 Database
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const GradingRubric = sequelize.define(
  'GradingRubric',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    
    /**
     * Type of deliverable this rubric evaluates
     */
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },
    
    /**
     * Name/description of the rubric
     */
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    
    /**
     * Array of evaluation criteria
     * Each criterion: { id, question, type (BINARY|SOFT), weight }
     */
    criteria: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    
    /**
     * Whether this rubric is currently active for use
     */
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: 'GradingRubrics',
    timestamps: true,
  }
);

module.exports = GradingRubric;
