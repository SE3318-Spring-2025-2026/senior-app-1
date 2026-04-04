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
  studentId: {
    type: DataTypes.STRING,
    unique: true,
    validate: {
      is: /^[0-9]{11}$/,
    },
  },
  role: {
    type: DataTypes.ENUM('STUDENT', 'PROFESSOR', 'COORDINATOR', 'ADMIN'),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'PASSWORD_SETUP_REQUIRED'),
    defaultValue: 'ACTIVE',
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  passwordHash: {
    type: DataTypes.STRING,
  },
  githubUsername: {
    type: DataTypes.STRING,
  },
  githubLinked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
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
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = User;