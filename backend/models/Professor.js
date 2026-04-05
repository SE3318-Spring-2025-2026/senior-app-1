const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const Professor = sequelize.define('Professor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
    unique: true,
  },
  department: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

// Define associations
User.hasOne(Professor, { foreignKey: 'userId' });
Professor.belongsTo(User, { foreignKey: 'userId' });

module.exports = Professor;
