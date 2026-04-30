'use strict';

const path = require('path');
const { Sequelize } = require('sequelize');

require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    logging: false,
  });
} else {
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

  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: resolvedStorage,
    logging: false,
  });
}

module.exports = sequelize;
