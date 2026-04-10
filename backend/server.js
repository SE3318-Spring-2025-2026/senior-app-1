const sequelize = require('./db');
const User = require('./models/User');
const Professor = require('./models/Professor');
const app = require('./app');
require('./models');
const { ensureValidStudentRegistry } = require('./services/studentService');

const ensureSqliteColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const userTable = await queryInterface.describeTable('Users');
  const userAttributes = User.getAttributes();
  const professorTable = await queryInterface.describeTable('Professors');
  const professorAttributes = Professor.getAttributes();
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
};

// Connect to SQLite and sync models
sequelize.authenticate()
  .then(() => {
    console.log("SQLite connected");
    return sequelize.sync({ alter: true });
  })
  .then(() => ensureSqliteColumns())
  .then(() => ensureValidStudentRegistry())
  .then(() => console.log("Database synced"))
  .catch(err => console.log("Database error:", err));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
