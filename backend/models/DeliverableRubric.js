const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const DeliverableRubric = sequelize.define('DeliverableRubric', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  deliverableName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  criteria: {
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
  tableName: 'DeliverableRubrics',
  timestamps: true,
});

module.exports = DeliverableRubric;
