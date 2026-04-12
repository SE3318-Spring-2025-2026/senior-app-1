// backend/models/index.js

const User = require('./User');
const Professor = require('./Professor');
const ValidStudentId = require('./ValidStudentId');
const OAuthState = require('./OAuthState');
const LinkedGitHubAccount = require('./LinkedGitHubAccount');
const Invitation = require('./Invitation');   // ← ADD

module.exports = {
  User,
  Professor,
  ValidStudentId,
  OAuthState,
  LinkedGitHubAccount,
  Invitation,                                // ← ADD
};