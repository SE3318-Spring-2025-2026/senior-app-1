require('dotenv').config();
const sequelize = require('./db');
const User = require('./models/User');

async function createAdmin() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    const [admin, created] = await User.findOrCreate({
      where: { email: 'admin@example.com' },
      defaults: {
        fullName: 'Admin User',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    if (created) {
      console.log('Admin user created with id:', admin.id);
    } else {
      console.log('Admin user already exists with id:', admin.id);
    }
  } catch (error) {
    console.error('Failed to create admin:', error);
  } finally {
    await sequelize.close();
  }
}

createAdmin().catch(console.error);