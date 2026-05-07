'use strict';

// backend/models/FinalEvaluationWeight.js
// Stores the single active advisor/committee weight configuration (upsert on id=1).

module.exports = (sequelize, DataTypes) => {
  const FinalEvaluationWeight = sequelize.define(
    'FinalEvaluationWeight',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      advisorWeight: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      committeeWeight: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: 'FinalEvaluationWeights',
      timestamps: true,
    }
  );

  FinalEvaluationWeight.associate = (models) => {
    FinalEvaluationWeight.belongsTo(models.User, {
      foreignKey: 'updatedBy',
      as: 'coordinator',
    });
  };

  return FinalEvaluationWeight;
};