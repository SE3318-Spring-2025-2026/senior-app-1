const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const OAuthState = sequelize.define('OAuthState', {
  state: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  consumedAt: {
    type: DataTypes.DATE,
  },
});

User.hasMany(OAuthState, { foreignKey: 'userId' });
OAuthState.belongsTo(User, { foreignKey: 'userId' });

module.exports = OAuthState;
