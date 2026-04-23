/**
 * models/Grade.js
 *
 * Represents a grade assigned by committee member or advisor to a deliverable.
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
     * User ID of the person submitting the grade
     */
    gradedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    
    /**
     * Type of grade submission
     */
    gradeType: {
      type: DataTypes.ENUM('ADVISOR_SOFT', 'COMMITTEE_FINAL', 'PEER_REVIEW'),
      allowNull: false,
    },
    
    /**
     * JSON array of criterion scores
     * Each score has:
     * {
     *   criterionId: UUID,
     *   value: number | string,
     *   note?: string
     * }
     */
    scores: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    
    /**
     * Overall comments on the deliverable
     */
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'Grades',
    timestamps: true,
    indexes: [
      {
        fields: ['deliverableId', 'gradedBy'],
        unique: true,
      },
    ],
  }
);

// Associations
Grade.belongsTo(Deliverable, { foreignKey: 'deliverableId' });
Grade.belongsTo(User, { foreignKey: 'gradedBy', as: 'grader' });
Deliverable.hasMany(Grade, { foreignKey: 'deliverableId' });

module.exports = Grade;
