const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const ValidStudentId = sequelize.define('ValidStudentId', {
  studentId: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    validate: {
      is: /^[0-9]{11}$/,
    },
  },
});

module.exports = ValidStudentId;
