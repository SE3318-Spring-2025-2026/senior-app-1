<<<<<<< HEAD
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
=======
/**
 * models/FinalEvaluationGrade.js
 *
 * Stores committee member grades for final evaluation of group deliverables.
 * One grade per (groupId, deliverableId, submittedBy) tuple.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Group = require('./Group');
const Deliverable = require('./Deliverable');
const User = require('./User');
>>>>>>> d244b26 (feat: P61 - Submit and update committee grade for group deliverable #368)

const FinalEvaluationGrade = sequelize.define(
  'FinalEvaluationGrade',
  {
    id: {
      type: DataTypes.UUID,
<<<<<<< HEAD
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    gradeType: {
      type: DataTypes.ENUM('ADVISOR', 'COMMITTEE'),
      allowNull: false,
    },
    gradedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
=======
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Groups',
        key: 'id',
      },
    },
    deliverableId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Deliverables',
        key: 'id',
      },
    },
    submittedBy: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'User ID of the committee member (PROFESSOR)',
>>>>>>> d244b26 (feat: P61 - Submit and update committee grade for group deliverable #368)
    },
    scores: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
<<<<<<< HEAD
    },
    finalScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
=======
      comment: 'Array of {criterionId, value, note}',
>>>>>>> d244b26 (feat: P61 - Submit and update committee grade for group deliverable #368)
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
<<<<<<< HEAD
=======
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
>>>>>>> d244b26 (feat: P61 - Submit and update committee grade for group deliverable #368)
  },
  {
    tableName: 'FinalEvaluationGrades',
    timestamps: true,
    indexes: [
      {
        unique: true,
<<<<<<< HEAD
        fields: ['groupId', 'gradeType', 'gradedBy'],
=======
        fields: ['groupId', 'deliverableId', 'submittedBy'],
>>>>>>> d244b26 (feat: P61 - Submit and update committee grade for group deliverable #368)
      },
    ],
  }
);

<<<<<<< HEAD
=======
// Associations
FinalEvaluationGrade.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
FinalEvaluationGrade.belongsTo(Deliverable, { foreignKey: 'deliverableId', as: 'deliverable' });
FinalEvaluationGrade.belongsTo(User, { foreignKey: 'submittedBy', as: 'reviewer' });

>>>>>>> d244b26 (feat: P61 - Submit and update committee grade for group deliverable #368)
module.exports = FinalEvaluationGrade;
