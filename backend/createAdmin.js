require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('./db');
const User = require('./models/User');

async function createAdmin() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass2026!';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const [admin, created] = await User.findOrCreate({
      where: { email: 'admin@example.com' },
      defaults: {
        fullName: 'Admin User',
        role: 'ADMIN',
        status: 'ACTIVE',
        password: hashedPassword,
      },
    });

    if (!created) {
      await admin.update({
        password: hashedPassword,
        status: 'ACTIVE',
      });
    }

    if (created) {
      console.log('Admin user created with id:', admin.id);
    } else {
      console.log('Admin user already exists with id:', admin.id);
    }

    console.log('Admin email:', admin.email);
    console.log('Admin password:', adminPassword);
  } catch (error) {
    console.error('Failed to create admin:', error);
  } finally {
    await sequelize.close();
  }
}

createAdmin().catch(console.error);
