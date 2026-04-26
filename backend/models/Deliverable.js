/**
 * models/Deliverable.js
 *
 * Stores submission documents (deliverables) for groups.
 * A deliverable is a document submitted by a group (e.g., proposal, SOW).
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');

const Deliverable = sequelize.define(
  'Deliverable',
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
    type: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
      comment: 'Type of deliverable: PROPOSAL or Statement of Work (SOW)',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Main document content (Markdown)',
    },
    images: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of image URLs/references',
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'),
      defaultValue: 'DRAFT',
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Document version number',
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
    indexes: [
      {
        unique: true,
        fields: ['groupId', 'type'],
      },
    ],
  }
);

// Associations
Deliverable.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

module.exports = Deliverable;
