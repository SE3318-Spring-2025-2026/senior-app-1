require('dotenv').config();
const express = require('express');
const sequelize = require('./db');
const User = require('./models/User');
const app = express();

// Middleware
app.use(express.json());

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
    return sequelize.sync();
  })
  .then(() => ensureSqliteColumns())
  .then(() => console.log("Database synced"))
  .catch(err => console.log("Database error:", err));

// Routes
const adminRoutes = require('./routes/admin');
const professorRoutes = require('./routes/professors');
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/professors', professorRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
