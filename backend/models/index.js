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
const AdvisorRequest = require('./AdvisorRequest');
const GroupAdvisorAssignment = require('./GroupAdvisorAssignment');
const Invitation = require('./Invitation');
const AuditLog = require('./AuditLog');
const Notification = require('./Notification');
const GradingRubric = require('./GradingRubric');
const Grade = require('./Grade');
const DeliverableRubric = require('./DeliverableRubric');
const Deliverable = require('./Deliverable');
const CommitteeReview = require('./CommitteeReview');
const SprintWeightConfiguration = require('./SprintWeightConfiguration');
const DeliverableSubmission = require('./DeliverableSubmission');

module.exports = {
  User,
  Professor,
  ValidStudentId,
  OAuthState,
  LinkedGitHubAccount,
  Group,
  GroupAdvisorAssignment,
  AdvisorRequest,
  Invitation,
  AuditLog,
  Notification,
  GradingRubric,
  Grade,
  DeliverableRubric,
  Deliverable,
  CommitteeReview,
  SprintWeightConfiguration,
  DeliverableSubmission,
};
