const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  normalizedName: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  leaderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  memberIds: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  advisorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    references: {
      model: User,
      key: 'id',
    },
  },
});

User.hasMany(Group, { foreignKey: 'leaderId' });
Group.belongsTo(User, { foreignKey: 'leaderId' });

module.exports = Group;
