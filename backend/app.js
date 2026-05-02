const express = require('express');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });
require('./middleware/asyncRouteErrors');

const { User, Group, AuditLog } = require('./models');
const {
  errorResponseNormalizer,
  globalErrorHandler,
  notFoundHandler,
} = require('./middleware/errorResponse');

const adminRoutes = require('./routes/admin');
const coordinatorRoutes = require('./routes/coordinator');
const advisorRoutes = require('./routes/advisors');
const advisorRequestRoutes = require('./routes/advisorRequests');
const professorRoutes = require('./routes/professors');
const teamLeaderRoutes = require('./routes/teamLeader');
const studentRoutes = require('./routes/students');
const authRoutes = require('./routes/auth');
const invitationRoutes = require('./routes/invitations');
const notificationsRoutes = require('./routes/notifications');
const passwordSetupTokenStoreRoutes = require('./routes/passwordSetupTokenStore');
const internalGithubRoutes = require('./routes/internalGithub');
const userDatabaseRoutes = require('./routes/userDatabase');
const groupRoutes = require('./routes/groups');
const groupDatabaseRoutes = require('./routes/groupDatabase');
const internalIntegrationsRoutes = require('./routes/internalIntegrations');
const internalEvaluationsRoutes = require('./routes/internalEvaluations');
const internalJiraRoutes = require('./routes/internalJira');
const internalGithubRoutes = require('./routes/internalGithub');
const internalSprintSyncRoutes = require('./routes/internalSprintSync');
const teamsRoutes = require('./routes/teams');
const submissionsRoutes = require('./routes/submissions');
const committeeRoutes = require('./routes/committee');

const app = express();
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.json({ limit: '10mb' }));
app.use(errorResponseNormalizer);

// Serve frontend if exists
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}

// Make models globally accessible
app.locals.models = { User, Group, AuditLog };

app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/coordinator', coordinatorRoutes);
app.use('/api/v1/advisors', advisorRoutes);
app.use('/api/v1/team-leader', teamLeaderRoutes);
app.use('/api/v1', advisorRequestRoutes);
app.use('/api/v1/professors', professorRoutes);
app.use('/api/v1', studentRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', invitationRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/password-setup-token-store', passwordSetupTokenStoreRoutes);
app.use('/api/v1/internal', internalGithubRoutes);
app.use('/api/v1/user-database', userDatabaseRoutes);
app.use('/api/v1/group-database', groupDatabaseRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/teams', teamsRoutes);
app.use('/api/v1/internal', internalIntegrationsRoutes);
app.use('/internal/integrations', internalIntegrationsRoutes);
app.use('/internal/evaluations', internalEvaluationsRoutes);
app.use('/internal/jira', internalJiraRoutes);
app.use('/internal/github', internalGithubRoutes);
app.use('/internal/sprint-sync', internalSprintSyncRoutes);
app.use('/api/v1/committee/submissions', submissionsRoutes);
app.use('/api/v1/committee', committeeRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;