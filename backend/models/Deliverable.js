/**
 * models/Deliverable.js
 * 
 * Represents a group's submitted deliverable (Proposal or Statement of Work).
 * D5 Document Storage
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');

const Deliverable = sequelize.define(
  'Deliverable',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    
    /**
     * Reference to the Group that submitted this deliverable
     */
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: Group,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    
    /**
     * Type of deliverable
     */
    type: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },
    
    /**
     * Markdown content of the deliverable
     */
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    
    /**
     * JSON array of image URLs for the deliverable
     */
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    
    /**
     * Version number for tracking revisions
     */
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    
    /**
     * Current status of the deliverable
     */
    status: {
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'GRADED'),
      allowNull: false,
      defaultValue: 'DRAFT',
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
    tableName: 'Deliverables',
    timestamps: true,
  }
);

/**
 * Unique constraint: one deliverable per group per type
 * (can't have two PROPOSAL deliverables for same group)
 */
Deliverable.addConstraint('deliverable_group_type_unique', {
  type: 'unique',
  fields: ['groupId', 'type'],
});

module.exports = Deliverable;
