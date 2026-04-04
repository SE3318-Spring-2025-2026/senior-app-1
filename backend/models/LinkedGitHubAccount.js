const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const LinkedGitHubAccount = sequelize.define('LinkedGitHubAccount', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: User,
      key: 'id',
    },
  },
  githubId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  githubUsername: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

User.hasOne(LinkedGitHubAccount, { foreignKey: 'userId' });
LinkedGitHubAccount.belongsTo(User, { foreignKey: 'userId' });

module.exports = LinkedGitHubAccount;
