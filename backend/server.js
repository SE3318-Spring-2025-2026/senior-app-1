const sequelize = require('./db');
const User = require('./models/User');
const Professor = require('./models/Professor');
const Group = require('./models/Group');
const IntegrationBinding = require('./models/IntegrationBinding');
const SprintPullRequest = require('./models/SprintPullRequest');
const SprintStory = require('./models/SprintStory');
const app = require('./app');
require('./models');
const { ensureValidStudentRegistry } = require('./services/studentService');
const { createScheduledSprintMonitoringRefresher } = require('./services/scheduledSprintMonitoringService');
const { RubricCriterion } = require('./models');

const ensureSqliteColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const userTable = await queryInterface.describeTable('Users');
  const userAttributes = User.getAttributes();
  const professorTable = await queryInterface.describeTable('Professors');
  const professorAttributes = Professor.getAttributes();
  const groupTable = await queryInterface.describeTable('Groups');
  const groupAttributes = Group.getAttributes();
  const sprintStoryTable = await queryInterface.describeTable('SprintStories');
  const sprintStoryAttributes = SprintStory.getAttributes();
  const sprintPullRequestTable = await queryInterface.describeTable('SprintPullRequests');
  const sprintPullRequestAttributes = SprintPullRequest.getAttributes();
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

  const integrationBindingTable = await queryInterface.describeTable('IntegrationBindings');
  const integrationBindingAttributes = IntegrationBinding.getAttributes();
  const integrationBindingColumnsToEnsure = [
    'jiraUserEmail',
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

  for (const columnName of integrationBindingColumnsToEnsure) {
    if (integrationBindingTable[columnName]) {
      continue;
    }

    const attribute = integrationBindingAttributes[columnName];
    await queryInterface.addColumn('IntegrationBindings', columnName, {
      type: attribute.type,
      allowNull: attribute.allowNull,
      defaultValue: attribute.defaultValue,
      unique: Boolean(attribute.unique),
    });
  }

  const sprintLifecycleColumnsToEnsure = [
    'isActive',
    'lastSeenAt',
    'staleAt',
  ];

  for (const columnName of sprintLifecycleColumnsToEnsure) {
    if (!sprintStoryTable[columnName]) {
      const attribute = sprintStoryAttributes[columnName];
      await queryInterface.addColumn('SprintStories', columnName, {
        type: attribute.type,
        allowNull: attribute.allowNull,
        defaultValue: attribute.defaultValue,
      });
    }

    if (!sprintPullRequestTable[columnName]) {
      const attribute = sprintPullRequestAttributes[columnName];
      await queryInterface.addColumn('SprintPullRequests', columnName, {
        type: attribute.type,
        allowNull: attribute.allowNull,
        defaultValue: attribute.defaultValue,
      });
    }
  }
};

const seedRubricCriteria = async () => {
  if (!RubricCriterion) {
    return;
  }
  await RubricCriterion.bulkCreate([
    { deliverableType: 'PROPOSAL', question: 'Technical Feasibility', criterionType: 'SOFT', maxPoints: 10, weight: 0.4 },
    { deliverableType: 'PROPOSAL', question: 'Project Scope Clarity', criterionType: 'SOFT', maxPoints: 10, weight: 0.4 },
    { deliverableType: 'PROPOSAL', question: 'Team Qualification', criterionType: 'BINARY', maxPoints: 5, weight: 0.2 },
  ], { ignoreDuplicates: true });
};

// Connect to SQLite and sync models
const sprintMonitoringRefresher = createScheduledSprintMonitoringRefresher();

sequelize.authenticate()
  .then(() => {
    console.log("SQLite connected");
    return sequelize.sync();
  })
  .then(() => ensureSqliteColumns())
  .then(() => ensureValidStudentRegistry())
  .then(() => seedRubricCriteria())
  .then(() => {
    console.log("Database synced");
    sprintMonitoringRefresher.start();
    if (sprintMonitoringRefresher.enabled) {
      console.log(`Scheduled sprint monitoring refresh enabled every ${sprintMonitoringRefresher.intervalMs}ms`);
    }
  })
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
