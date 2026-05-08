require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('./db');
const User = require('./models/User');
const ValidStudentId = require('./models/ValidStudentId');

async function createStudent() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    const studentId = process.env.STUDENT_ID || '12345678901';
    const email = process.env.STUDENT_EMAIL || 'student@example.edu';
    const fullName = process.env.STUDENT_FULL_NAME || 'Test Student';
    const password = process.env.STUDENT_PASSWORD || 'StudentPass2026!';
    const passwordHash = await bcrypt.hash(password, 10);

    await ValidStudentId.findOrCreate({ where: { studentId } });

    const [user, created] = await User.findOrCreate({
      where: { studentId },
      defaults: {
        email,
        fullName,
        studentId,
        role: 'STUDENT',
        status: 'ACTIVE',
        passwordHash,
      },
    });

    if (!created) {
      await user.update({ email, fullName, status: 'ACTIVE', passwordHash });
    }

    console.log(created ? 'Student created.' : 'Student updated.');
    console.log('Student ID:', studentId);
    console.log('Password: ', password);
  } catch (error) {
    console.error('Failed to create student:', error);
  } finally {
    await sequelize.close();
  }
}

createStudent().catch(console.error);
