const sequelize = require('./db');
const User = require('./models/User');
const Professor = require('./models/Professor');
const Group = require('./models/Group');
const app = require('./app');
require('./models');
const { ensureValidStudentRegistry } = require('./services/studentService');
const { RubricCriterion } = require('./models');

const ensureSqliteColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const userTable = await queryInterface.describeTable('Users');
  const userAttributes = User.getAttributes();
  const professorTable = await queryInterface.describeTable('Professors');
  const professorAttributes = Professor.getAttributes();
  const groupTable = await queryInterface.describeTable('Groups');
  const groupAttributes = Group.getAttributes();
  const columnsToEnsure = [
    'studentId',
    'password',
    'passwordHash',
    'githubUsername',
    'githubLinked',
  ];

  for (const columnName of columnsToEnsure) {
    if (userTable[columnName]) {
      continue;
    }

    const attribute = userAttributes[columnName];
    await queryInterface.addColumn('Users', columnName, {
      type: attribute.type,
      allowNull: attribute.allowNull,
      defaultValue: attribute.defaultValue,
      unique: Boolean(attribute.unique),
    });
  }

  const professorColumnsToEnsure = [
    'fullName',
  ];

  for (const columnName of professorColumnsToEnsure) {
    if (professorTable[columnName]) {
      continue;
    }

    const attribute = professorAttributes[columnName];
    await queryInterface.addColumn('Professors', columnName, {
      type: attribute.type,
      allowNull: attribute.allowNull,
      defaultValue: attribute.defaultValue,
      unique: Boolean(attribute.unique),
    });
  }

  const groupColumnsToEnsure = [
    'maxMembers',
    'status',
    'memberIds',
  ];

  for (const columnName of groupColumnsToEnsure) {
    if (groupTable[columnName]) {
      continue;
    }

    const attribute = groupAttributes[columnName];
    await queryInterface.addColumn('Groups', columnName, {
      type: attribute.type,
      allowNull: attribute.allowNull,
      defaultValue: attribute.defaultValue,
      unique: Boolean(attribute.unique),
    });
  }
};

const seedRubricCriteria = async () => {
  await RubricCriterion.bulkCreate([
    { deliverableType: 'PROPOSAL', question: 'Technical Feasibility', criterionType: 'SOFT', maxPoints: 10, weight: 0.4 },
    { deliverableType: 'PROPOSAL', question: 'Project Scope Clarity', criterionType: 'SOFT', maxPoints: 10, weight: 0.4 },
    { deliverableType: 'PROPOSAL', question: 'Team Qualification', criterionType: 'BINARY', maxPoints: 5, weight: 0.2 },
  ], { ignoreDuplicates: true });
};

// Connect to SQLite and sync models
sequelize.authenticate()
  .then(() => {
    console.log("SQLite connected");
    return sequelize.sync();
  })
  .then(() => ensureSqliteColumns())
  .then(() => ensureValidStudentRegistry())
  .then(() => seedRubricCriteria())
  .then(() => console.log("Database synced"))
  .catch(err => console.log("Database error:", err));

const BASE_PORT = Number(process.env.PORT || 3001);
const MAX_PORT_ATTEMPTS = 10;

function startServer(basePort, attemptsLeft) {
  const server = app.listen(basePort, () => {
    if (basePort !== BASE_PORT) {
      console.log(`Preferred port ${BASE_PORT} is busy. Using port ${basePort}.`);
    }
    console.log(`Server running on port ${basePort}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = basePort + 1;
      console.warn(`Port ${basePort} is already in use. Retrying on ${nextPort}...`);
      startServer(nextPort, attemptsLeft - 1);
      return;
    }

    console.error('Server startup failed:', error);
    process.exit(1);
  });
}

startServer(BASE_PORT, MAX_PORT_ATTEMPTS);

module.exports = app;
