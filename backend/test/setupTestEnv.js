'use strict';

/**
 * Shared test defaults. JWT_SECRET must come from the environment (see package.json "test" script),
 * not from hardcoded strings in test files.
 */
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET must be set when running tests. Run: npm test (from backend/)',
  );
}

if (process.env.SQLITE_STORAGE === undefined) {
  process.env.SQLITE_STORAGE = ':memory:';
}
if (process.env.FRONTEND_URL === undefined) {
  process.env.FRONTEND_URL = 'http://localhost:5173';
}
if (process.env.GITHUB_CLIENT_ID === undefined) {
  process.env.GITHUB_CLIENT_ID = '';
}
if (process.env.GITHUB_CLIENT_SECRET === undefined) {
  process.env.GITHUB_CLIENT_SECRET = '';
}
