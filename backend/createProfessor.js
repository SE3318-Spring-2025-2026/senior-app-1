require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('./db');
const User = require('./models/User');
const Professor = require('./models/Professor');

async function createProfessor() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    const email = process.env.PROFESSOR_EMAIL || 'professor@example.com';
    const fullName = process.env.PROFESSOR_FULL_NAME || 'Professor User';
    const password = process.env.PROFESSOR_PASSWORD || 'ProfessorPass2026!';
    const department = process.env.PROFESSOR_DEPARTMENT || 'Computer Engineering';
    const hashedPassword = await bcrypt.hash(password, 10);

    const [user, userCreated] = await User.findOrCreate({
      where: { email },
      defaults: {
        fullName,
        role: 'PROFESSOR',
        status: 'ACTIVE',
        password: hashedPassword,
      },
    });

    if (!userCreated) {
      await user.update({ fullName, role: 'PROFESSOR', status: 'ACTIVE', password: hashedPassword });
    }

    const [professor, profCreated] = await Professor.findOrCreate({
      where: { userId: user.id },
      defaults: { userId: user.id, department, fullName },
    });

    if (!profCreated) {
      await professor.update({ department, fullName });
    }

    console.log(profCreated ? 'Professor created.' : 'Professor updated.');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Department:', department);
  } catch (error) {
    console.error('Failed to create professor:', error);
  } finally {
    await sequelize.close();
  }
}

createProfessor().catch(console.error);
