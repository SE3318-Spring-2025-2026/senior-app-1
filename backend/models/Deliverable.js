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
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    images: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'GRADED'),
      allowNull: false,
      defaultValue: 'SUBMITTED',
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    sprintNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
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

Deliverable.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

module.exports = Deliverable;
