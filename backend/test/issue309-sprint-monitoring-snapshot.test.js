require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const {
  Group,
  IntegrationBinding,
  IntegrationTokenReference,
  SprintPullRequest,
  SprintStory,
  User,
} = require('../models');

let server;
let baseUrl;

function internalHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-internal-api-key': process.env.INTERNAL_API_KEY,
  };
}

async function authHeadersFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

test.before(async () => {
  await sequelize.sync({ force: true });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await sequelize.close();
});

test.beforeEach(async () => {
  await SprintPullRequest.destroy({ where: {} });
  await SprintStory.destroy({ where: {} });
  await IntegrationTokenReference.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('stores structured Jira and GitHub sprint monitoring data and returns linked snapshot', async () => {
  const leader = await User.create({
    email: 'monitoring-owner@example.edu',
    fullName: 'Monitoring Owner',
    studentId: '11070003101',
    role: 'STUDENT',
    status: 'ACTIVE',
    password: 'StrongPass1!',
  });

  await Group.create({
    id: 'team-monitoring',
    name: 'Group team-monitoring',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
  });

  await IntegrationBinding.create({
    teamId: 'team-monitoring',
    providerSet: ['GITHUB', 'JIRA'],
    organizationName: 'acme-org',
    repositoryName: 'senior-app',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    defaultBranch: 'main',
    initiatedBy: String(leader.id),
    status: 'ACTIVE',
  });

  await request('/internal/jira/issues', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team-monitoring',
      sprintId: 'sprint-42',
      receivedAt: '2026-05-02T12:00:00Z',
      issues: [
        {
          key: 'SPM-214',
          fields: {
            summary: 'Fix login validation',
            description: 'Ensure invalid payloads are rejected.',
            status: { name: 'In Progress' },
            assignee: { accountId: 'student-11' },
            reporter: { accountId: 'prof-3' },
            customfield_10016: 5,
            created: '2026-05-01T08:00:00Z',
            updated: '2026-05-02T11:00:00Z',
          },
        },
      ],
    }),
  });

  await request('/internal/github/pr-data', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team-monitoring',
      sprintId: 'sprint-42',
      receivedAt: '2026-05-02T12:10:00Z',
      pullRequests: [
        {
          prNumber: 142,
          title: 'SPM-214 Fix login validation',
          branchName: 'SPM-214-login-validation',
          prStatus: 'OPEN',
          mergeStatus: 'UNKNOWN',
          changedFiles: [
            { filename: 'backend/controllers/authController.js', status: 'modified', additions: 10, deletions: 2, changes: 12 },
          ],
          diffSummary: {
            additions: 10,
            deletions: 2,
            changedFilesCount: 1,
            totalChanges: 12,
            summary: '10 additions, 2 deletions across 1 files',
          },
        },
      ],
    }),
  });

  const snapshot = await request('/api/v1/teams/team-monitoring/sprints/sprint-42/monitoring', {
    headers: await authHeadersFor(leader),
  });

  assert.equal(snapshot.response.status, 200);
  assert.equal(snapshot.json.teamId, 'team-monitoring');
  assert.equal(snapshot.json.sprintId, 'sprint-42');
  assert.equal(snapshot.json.stories.length, 1);
  assert.equal(snapshot.json.stories[0].issueKey, 'SPM-214');
  assert.equal(snapshot.json.stories[0].assigneeId, 'student-11');
  assert.equal(snapshot.json.stories[0].reporterId, 'prof-3');
  assert.equal(snapshot.json.stories[0].storyPoints, 5);
  assert.equal(snapshot.json.stories[0].linkedPullRequests.length, 1);
  assert.equal(snapshot.json.stories[0].linkedPullRequests[0].prNumber, 142);
  assert.equal(snapshot.json.unlinkedPullRequests.length, 0);
});
