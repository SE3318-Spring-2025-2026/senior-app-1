const bcrypt = require('bcryptjs');
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

async function createStudentAccountFromValidatedData({ studentId, email, fullName, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  return createStudentAccountRecord({
    studentId,
    email,
    fullName,
    passwordHash,
  });
}

module.exports = {
  createStudentAccountFromValidatedData,
  createStudentAccountRecord,
};
