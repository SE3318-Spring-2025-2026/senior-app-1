const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const PasswordResetToken = sequelize.define(
  'PasswordResetToken',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    tokenHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    invalidatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdByAdminId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
  },
  {
    tableName: 'PasswordResetTokens',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['expiresAt'] },
      { unique: true, fields: ['tokenHash'] },
    ],
  },
);

User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'passwordResetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(PasswordResetToken, { foreignKey: 'createdByAdminId', as: 'createdPasswordResetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'createdByAdminId', as: 'createdByAdmin' });

module.exports = PasswordResetToken;
