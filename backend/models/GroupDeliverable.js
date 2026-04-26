const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const GroupDeliverable = sequelize.define(
  'GroupDeliverable',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    documentRef: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: DataTypes.UUIDV4,
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    markdownContent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrls: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    tableName: 'GroupDeliverables',
    timestamps: true,
  },
);

module.exports = GroupDeliverable;