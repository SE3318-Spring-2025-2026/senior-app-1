const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Deliverable = sequelize.define(
  'Deliverable',
  {
    id: {
      type: DataTypes.STRING,
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
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('SUBMITTED', 'UNDER_REVIEW', 'GRADED'),
      allowNull: false,
      defaultValue: 'SUBMITTED',
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
  }
);

module.exports = Deliverable;
