const bcrypt = require('bcryptjs');
const sequelize = require('../db');
const { User, ValidStudentId } = require('../models');

const students = [
  { studentId: '11070001000', fullName: 'Leader Student', email: 'leader.student@example.com' },
  { studentId: '11070001001', fullName: 'Invitee Student', email: 'invitee.student@example.com' },
  { studentId: '11070001002', fullName: 'Stranger Student', email: 'stranger.student@example.com' },
];

async function seed() {
  await sequelize.authenticate();
  await sequelize.sync();

  const passwordHash = await bcrypt.hash('StrongPass1!', 10);

  for (const student of students) {
    await ValidStudentId.findOrCreate({
      where: { studentId: student.studentId },
      defaults: { studentId: student.studentId },
    });

    await User.findOrCreate({
      where: { studentId: student.studentId },
      defaults: {
        email: student.email,
        fullName: student.fullName,
        studentId: student.studentId,
        role: 'STUDENT',
        status: 'ACTIVE',
        passwordHash,
      },
    });
  }
}

seed()
  .then(() => {
    console.log('[seedPlaywrightUsers] Completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[seedPlaywrightUsers] Failed', error);
    process.exit(1);
  });
