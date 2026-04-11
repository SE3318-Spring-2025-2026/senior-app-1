  const path = require('path');
  const { Sequelize } = require('sequelize');

  const configuredStorage = process.env.SQLITE_STORAGE;
  const resolvedStorage = configuredStorage
    ? (
      configuredStorage === ':memory:' || configuredStorage.startsWith('file:')
        ? configuredStorage
        : (path.isAbsolute(configuredStorage)
          ? configuredStorage
          : path.join(__dirname, configuredStorage))
    )
    : path.join(__dirname, 'database.sqlite');

  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: resolvedStorage,
    logging: false,
  });

  module.exports = sequelize;
