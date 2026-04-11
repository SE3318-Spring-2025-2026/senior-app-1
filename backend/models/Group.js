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
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
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
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
});

User.hasMany(Group, { as: 'ledGroups', foreignKey: 'leaderId' });
User.hasMany(Group, { as: 'advisedGroups', foreignKey: 'advisorId' });
Group.belongsTo(User, { as: 'leader', foreignKey: 'leaderId' });
Group.belongsTo(User, { as: 'advisor', foreignKey: 'advisorId' });

module.exports = Group;
