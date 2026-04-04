const User = require('../models/User');
const studentService = require('./studentService');

async function createStudentAccountRecord({ studentId, email, fullName, passwordHash }) {
  return User.create({
    studentId,
    email: studentService.normalizeEmail(email),
    fullName: fullName.trim(),
    passwordHash: passwordHash.trim(),
    role: 'STUDENT',
    status: 'ACTIVE',
  });
}

module.exports = {
  createStudentAccountRecord,
};
