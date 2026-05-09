'use strict';

const path = require('path');
const { Sequelize } = require('sequelize');

require('dotenv').config();

let sequelize;

// Set USE_LOCAL_SQLITE=1 to bypass DATABASE_URL and use the local SQLite file
// instead — gives instant queries for solo development when you don't need the
// shared Supabase data.
const FORCE_LOCAL = String(process.env.USE_LOCAL_SQLITE || '').match(/^(1|true|yes)$/i);

if (process.env.DATABASE_URL && !FORCE_LOCAL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      // Reuse the TLS connection across queries instead of paying a fresh
      // TCP + TLS handshake per request (the dominant latency vs Supabase).
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      // Don't let a runaway query block the whole pool — kill at 30s.
      statement_timeout: 30_000,
    },
    pool: {
      // ≥ 1 keeps a warm connection so subsequent queries skip the handshake.
      max: Number(process.env.DB_POOL_MAX || 10),
      min: Number(process.env.DB_POOL_MIN || 1),
      // Keep idle connections for 30s before recycling — long enough for
      // reuse during a request burst, short enough to play nicely with
      // Supabase's pooler.
      idle: Number(process.env.DB_POOL_IDLE || 30_000),
      acquire: Number(process.env.DB_POOL_ACQUIRE || 30_000),
      evict: 1_000,
    },
    benchmark: false,
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
