
// This script generates a JWT token for a student user with the specified user ID.
// Usage: node generateStudentToken.js <userId>
// For only development/testing purposes. Do not use in production.

const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { User } = require('./models');

const userId = Number(process.argv[2]);

if (!Number.isInteger(userId) || userId <= 0) {
  console.error('Usage: node generateStudentToken.js <userId>');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing in backend/.env');
  process.exit(1);
}

async function run() {
  const user = await User.findByPk(userId);

  if (!user) {
    console.error(`User not found for id=${userId}`);
    process.exit(1);
  }

  if (user.role !== 'STUDENT' || user.status !== 'ACTIVE' || !user.studentId) {
    console.error(
      `User id=${userId} is not an active student account. role=${user.role}, status=${user.status}, studentId=${user.studentId || '-'}`,
    );
    process.exit(1);
  }

  const token = jwt.sign(
    { id: userId, role: 'STUDENT' },
    process.env.JWT_SECRET,
  );

  console.log(token);
}

run().catch((error) => {
  console.error('Failed to generate token:', error.message);
  process.exit(1);
});
