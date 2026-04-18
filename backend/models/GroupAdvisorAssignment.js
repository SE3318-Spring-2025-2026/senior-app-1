const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');
const User = require('./User');

const GroupAdvisorAssignment = sequelize.define(
  'GroupAdvisorAssignment',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: Group,
        key: 'id',
      },
    },
    studentUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    advisorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
  },
  {
    tableName: 'GroupAdvisorAssignments',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['groupId', 'studentUserId'],
      },
    ],
  },
);

Group.hasMany(GroupAdvisorAssignment, { foreignKey: 'groupId' });
GroupAdvisorAssignment.belongsTo(Group, { foreignKey: 'groupId' });

User.hasMany(GroupAdvisorAssignment, { foreignKey: 'studentUserId', as: 'advisorAssignments' });
GroupAdvisorAssignment.belongsTo(User, { foreignKey: 'studentUserId', as: 'studentUser' });

User.hasMany(GroupAdvisorAssignment, { foreignKey: 'advisorUserId', as: 'assignedGroups' });
GroupAdvisorAssignment.belongsTo(User, { foreignKey: 'advisorUserId', as: 'advisorUser' });

module.exports = GroupAdvisorAssignment;
