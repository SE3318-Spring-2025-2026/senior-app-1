/**
 * models/index.js
 *
 * Central model registry.
 * Add every Sequelize model here so the rest of the app can import from
 * a single location and so `sequelize.sync()` / migrations see all tables.
 */

const User = require('./User');
const Professor = require('./Professor');
const ValidStudentId = require('./ValidStudentId');
const OAuthState = require('./OAuthState');
const LinkedGitHubAccount = require('./LinkedGitHubAccount');
const Notification = require('./Notification');           // ← NEW (D9)

module.exports = {
  User,
  Professor,
  ValidStudentId,
  OAuthState,
  LinkedGitHubAccount,
  Notification,                                          // ← NEW (D9)
};