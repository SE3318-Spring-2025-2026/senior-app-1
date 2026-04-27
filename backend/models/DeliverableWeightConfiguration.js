/**
 * models/DeliverableWeightConfiguration.js
 *
 * Stores weight/importance configuration for deliverables in grading.
 * Defines how much each deliverable (Proposal/SoW) contributes to final grade.
 * Created by coordinator, used by grading system.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const DeliverableWeightConfiguration = sequelize.define(
  'DeliverableWeightConfiguration',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    /**
     * Deliverable type this weight applies to
     */
    deliverableType: {
      type: DataTypes.ENUM('PROPOSAL', 'SOW'),
      allowNull: false,
    },

    /**
     * Weight/percentage for this deliverable in overall grading
     * Between 0 and 1 (0.5 = 50%)
     */
    weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: {
        min: 0,
        max: 1,
      },
    },

    /**
     * Description of what this weight applies to
     */
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    /**
     * Sprint number this weight applies to (optional)
     * null means applies to all sprints
     */
    sprintNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    /**
     * Whether this configuration is currently active
     */
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'DeliverableWeightConfigurations',
    timestamps: true,
    indexes: [
      {
        fields: ['deliverableType', 'sprintNumber', 'isActive'],
      },
    ],
  }
);

module.exports = DeliverableWeightConfiguration;
