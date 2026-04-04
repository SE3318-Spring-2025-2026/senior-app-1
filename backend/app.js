require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { User } = require('./models');
const adminRoutes = require('./routes/admin');
const professorRoutes = require('./routes/professors');
const studentRoutes = require('./routes/students');
const userDatabaseRoutes = require('./routes/userDatabase');

const app = express();
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.json());
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}
app.locals.models = { User };
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/professors', professorRoutes);
app.use('/api/v1', studentRoutes);
app.use('/api/v1/user-database', userDatabaseRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

module.exports = app;
