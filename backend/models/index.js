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
const Group = require('./Group');
const Invitation = require('./Invitation');
const AuditLog = require('./AuditLog');
const Notification = require('./Notification');

const AdvisorRequest = require('./AdvisorRequest');

module.exports = {
  User,
  Professor,
  ValidStudentId,
  OAuthState,
  LinkedGitHubAccount,
  Group,
  Invitation,
  AuditLog,
  Notification,
  AdvisorRequest,
};
