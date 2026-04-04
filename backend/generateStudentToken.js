
// This script generates a JWT token for a student user with the specified user ID.
// Usage: node generateStudentToken.js <userId>
// For only development/testing purposes. Do not use in production.

const jwt = require('jsonwebtoken');
require('dotenv').config();

const userId = Number(process.argv[2]);

if (!Number.isInteger(userId) || userId <= 0) {
  console.error('Usage: node generateStudentToken.js <userId>');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing in backend/.env');
  process.exit(1);
}

const token = jwt.sign(
  { id: userId, role: 'STUDENT' },
  process.env.JWT_SECRET,
);

console.log(token);
