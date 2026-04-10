// This script creates or updates a coordinator user in the database using if exists environment variables for configuration.
// To run this script, use the command: node createCoordinator.js
// This is for development and testing purposes to ensure a coordinator account is available without manual database manipulation.
// Not so safe can be changed or updated



require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('./db');
const User = require('./models/User');

async function createCoordinator() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    const coordinatorEmail = process.env.COORDINATOR_EMAIL || 'coordinator@example.com';
    const coordinatorFullName = process.env.COORDINATOR_FULL_NAME || 'Coordinator User';
    const coordinatorPassword = process.env.COORDINATOR_PASSWORD || 'CoordinatorPass2026!';
    const hashedPassword = await bcrypt.hash(coordinatorPassword, 10);

    const [coordinator, created] = await User.findOrCreate({
      where: { email: coordinatorEmail },
      defaults: {
        fullName: coordinatorFullName,
        role: 'COORDINATOR',
        status: 'ACTIVE',
        password: hashedPassword,
      },
    });

    if (!created) {
      await coordinator.update({
        fullName: coordinatorFullName,
        role: 'COORDINATOR',
        status: 'ACTIVE',
        password: hashedPassword,
      });
    }

    if (created) {
      console.log('Coordinator user created with id:', coordinator.id);
    } else {
      console.log('Coordinator user already exists and was updated. id:', coordinator.id);
    }

    console.log('Coordinator email:', coordinatorEmail);
    console.log('Coordinator password:', coordinatorPassword);
  } catch (error) {
    console.error('Failed to create coordinator:', error);
  } finally {
    await sequelize.close();
  }
}

createCoordinator().catch(console.error);
