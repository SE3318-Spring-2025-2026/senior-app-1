/**
 * models/GradingRubric.js
 *
 * Represents rubric criteria for grading deliverables.
 * Created by coordinator, used by committee members.
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
     * Deliverable type this rubric is for
     */
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },
    
    /**
     * Display name for the rubric
     */
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    
    /**
     * JSON array of criteria
     * Each criterion has:
     * {
     *   id: UUID,
     *   question: string,
     *   type: 'BINARY' | 'SOFT',
     *   weight: number (0-1)
     * }
     */
    criteria: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    
    /**
     * Whether this rubric is currently active
     */
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'GradingRubrics',
    timestamps: true,
  }
);

module.exports = GradingRubric;
