const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const DeliverableRubric = sequelize.define('DeliverableRubric', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  deliverableName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  criteria: {
    // Array of { name, description, maxPoints }
    type: DataTypes.JSON,
    allowNull: false,
  },
  totalPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'deliverable_rubrics',
  timestamps: true,
});

module.exports = DeliverableRubric;