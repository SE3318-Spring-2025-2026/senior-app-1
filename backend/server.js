const sequelize = require('./db');
const User = require('./models/User');
const app = require('./app');
require('./models');
const { ensureValidStudentRegistry } = require('./services/studentService');

const ensureSqliteColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const userTable = await queryInterface.describeTable('Users');

  if (!userTable.password) {
    await queryInterface.addColumn('Users', 'password', {
      type: User.getAttributes().password.type,
      allowNull: true,
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
