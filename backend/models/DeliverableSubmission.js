const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const DeliverableSubmission = sequelize.define(
  'DeliverableSubmission',
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
    sprintNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },
    documentRef: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    submittedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: 'DeliverableSubmissions',
    timestamps: true,
  },
);

module.exports = DeliverableSubmission;
