const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('STUDENT', 'PROFESSOR', 'COORDINATOR', 'ADMIN'),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'PASSWORD_SETUP_REQUIRED'),
    defaultValue: 'ACTIVE',
  },
  passwordSetupTokenHash: {
    type: DataTypes.STRING,
  },
  passwordSetupTokenExpiresAt: {
    type: DataTypes.DATE,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = User;
