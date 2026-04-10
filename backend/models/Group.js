const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  teamLeaderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  advisorId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Professors',
      key: 'id',
    },
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

// Associations
User.hasMany(Group, { foreignKey: 'teamLeaderId', as: 'leaderGroups' });
Group.belongsTo(User, { foreignKey: 'teamLeaderId', as: 'teamLeader' });

module.exports = Group;
