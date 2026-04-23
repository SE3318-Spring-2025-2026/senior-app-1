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
     * Array of image URLs associated with this deliverable
     */
    images: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    
    /**
     * Version/revision number for tracking updates
     */
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    
    /**
     * Status of the deliverable
     */
    status: {
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'GRADED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
  },
  {
    tableName: 'Deliverables',
    timestamps: true,
    indexes: [
      {
        fields: ['groupId', 'type'],
        unique: true,
      },
    ],
  }
);

// Associations
Deliverable.belongsTo(Group, { foreignKey: 'groupId' });
Group.hasMany(Deliverable, { foreignKey: 'groupId' });

module.exports = Deliverable;
