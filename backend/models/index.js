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
const IntegrationTokenReference = require('./IntegrationTokenReference');
const IntegrationBinding = require('./IntegrationBinding');
const GradingRubric = require('./GradingRubric');
const Grade = require('./Grade');
const DeliverableRubric = require('./DeliverableRubric');
const Deliverable = require('./Deliverable');
const CommitteeReview = require('./CommitteeReview');
const SprintWeightConfiguration = require('./SprintWeightConfiguration');
const DeliverableSubmission = require('./DeliverableSubmission');
const DeliverableWeightConfiguration = require('./DeliverableWeightConfiguration');
const GroupDeliverable = require('./GroupDeliverable');
const PrMetric = require('./PrMetric');
const StoryMetric = require('./StoryMetric');
const FinalEvaluationGrade = require('./FinalEvaluationGrade');
const FinalEvaluationWeight = require('./FinalEvaluationWeight');
const TeamScalar = require('./TeamScalar');
const SprintMemberRecord = require('./SprintMemberRecord');

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
  IntegrationTokenReference,
  IntegrationBinding,
  GradingRubric,
  Grade,
  DeliverableRubric,
  Deliverable,
  CommitteeReview,
  SprintWeightConfiguration,
  DeliverableSubmission,
  DeliverableWeightConfiguration,
  GroupDeliverable,
  PrMetric,
  StoryMetric,
  FinalEvaluationGrade,
  FinalEvaluationWeight,
  TeamScalar,
  SprintMemberRecord,
};
