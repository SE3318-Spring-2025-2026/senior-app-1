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

async function createStudentUser({ email, fullName, studentId }) {
  return User.create({
    email,
    fullName,
    studentId,
    role: 'STUDENT',
    status: 'ACTIVE',
    password: 'StrongPass1!',
  });
}

async function createMonitoringTeam({
  teamId = 'team-monitoring',
  leader,
  memberIds,
  includeBinding = true,
  includeTokenReference = false,
} = {}) {
  await Group.create({
    id: teamId,
    name: `Group ${teamId}`,
    leaderId: String(leader.id),
    memberIds: memberIds || [String(leader.id)],
    maxMembers: 4,
  });

  if (!includeBinding) {
    return;
  }

  await IntegrationBinding.create({
    teamId,
    providerSet: ['GITHUB', 'JIRA'],
    organizationName: 'acme-org',
    repositoryName: 'senior-app',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    defaultBranch: 'main',
    initiatedBy: String(leader.id),
    status: 'ACTIVE',
  });

  if (includeTokenReference) {
    await IntegrationTokenReference.create({
      teamId,
      githubTokenRef: `vault://github/${teamId}`,
      jiraTokenRef: `vault://jira/${teamId}`,
    });
  }
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

test('snapshot returns unlinked pull requests and token-ref presence without exposing token values', async () => {
  const leader = await createStudentUser({
    email: 'monitoring-unlinked@example.edu',
    fullName: 'Monitoring Unlinked',
    studentId: '11070003102',
  });
  await createMonitoringTeam({
    leader,
    teamId: 'team-monitoring-unlinked',
    includeTokenReference: true,
  });

  await SprintStory.create({
    teamId: 'team-monitoring-unlinked',
    sprintId: 'sprint-99',
    issueKey: 'SPM-301',
    title: 'Linked story',
    status: 'IN_PROGRESS',
  });

  await SprintPullRequest.bulkCreate([
    {
      teamId: 'team-monitoring-unlinked',
      sprintId: 'sprint-99',
      prNumber: 501,
      relatedIssueKey: 'SPM-301',
      branchName: 'SPM-301-linked',
      prStatus: 'OPEN',
      mergeStatus: 'MERGEABLE',
      changedFiles: [],
      diffSummary: { summary: 'linked' },
    },
    {
      teamId: 'team-monitoring-unlinked',
      sprintId: 'sprint-99',
      prNumber: 777,
      relatedIssueKey: null,
      branchName: 'chore/unlinked-cleanup',
      title: 'Unlinked cleanup',
      prStatus: 'OPEN',
      mergeStatus: 'UNKNOWN',
      changedFiles: [{ filename: 'backend/app.js', status: 'modified', additions: 1, deletions: 0, changes: 1 }],
      diffSummary: { summary: '1 addition' },
      url: 'https://github.com/acme-org/senior-app/pull/777',
    },
  ]);

  const snapshot = await request('/api/v1/teams/team-monitoring-unlinked/sprints/sprint-99/monitoring', {
    headers: await authHeadersFor(leader),
  });

  assert.equal(snapshot.response.status, 200);
  assert.equal(snapshot.json.integration.hasGithubTokenRef, true);
  assert.equal(snapshot.json.integration.hasJiraTokenRef, true);
  assert.equal(snapshot.json.integration.githubTokenRef, undefined);
  assert.equal(snapshot.json.integration.jiraTokenRef, undefined);
  assert.equal(snapshot.json.stories[0].linkedPullRequests.length, 1);
  assert.equal(snapshot.json.unlinkedPullRequests.length, 1);
  assert.equal(snapshot.json.unlinkedPullRequests[0].prNumber, 777);
  assert.equal(snapshot.json.unlinkedPullRequests[0].title, 'Unlinked cleanup');
});

test('snapshot rejects blank route params with validation errors', async () => {
  const leader = await createStudentUser({
    email: 'monitoring-validation@example.edu',
    fullName: 'Monitoring Validation',
    studentId: '11070003103',
  });

  const snapshot = await request('/api/v1/teams/%20%20%20/sprints/sprint-42/monitoring', {
    headers: await authHeadersFor(leader),
  });

  assert.equal(snapshot.response.status, 400);
  assert.equal(snapshot.json.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(snapshot.json.errors));
});

test('snapshot is limited to the team leader or authorized staff', async () => {
  const leader = await createStudentUser({
    email: 'monitoring-restricted-owner@example.edu',
    fullName: 'Monitoring Restricted Owner',
    studentId: '11070003104',
  });
  const member = await createStudentUser({
    email: 'monitoring-restricted-member@example.edu',
    fullName: 'Monitoring Restricted Member',
    studentId: '11070003105',
  });
  await createMonitoringTeam({
    leader,
    teamId: 'team-monitoring-restricted',
    memberIds: [String(leader.id), String(member.id)],
  });

  const snapshot = await request('/api/v1/teams/team-monitoring-restricted/sprints/sprint-42/monitoring', {
    headers: await authHeadersFor(member),
  });

  assert.equal(snapshot.response.status, 403);
  assert.equal(snapshot.json.code, 'FORBIDDEN');
});

test('snapshot returns 404 when the team has no integration binding', async () => {
  const leader = await createStudentUser({
    email: 'monitoring-missing-binding@example.edu',
    fullName: 'Monitoring Missing Binding',
    studentId: '11070003106',
  });
  await createMonitoringTeam({
    leader,
    teamId: 'team-monitoring-unbound',
    includeBinding: false,
  });

  const snapshot = await request('/api/v1/teams/team-monitoring-unbound/sprints/sprint-42/monitoring', {
    headers: await authHeadersFor(leader),
  });

  assert.equal(snapshot.response.status, 404);
  assert.equal(snapshot.json.code, 'INTEGRATION_BINDING_NOT_FOUND');
});

test('snapshot returns 404 when the team does not exist', async () => {
  const leader = await createStudentUser({
    email: 'monitoring-missing-group@example.edu',
    fullName: 'Monitoring Missing Group',
    studentId: '11070003107',
  });

  const snapshot = await request('/api/v1/teams/team-monitoring-missing/sprints/sprint-42/monitoring', {
    headers: await authHeadersFor(leader),
  });

  assert.equal(snapshot.response.status, 404);
  assert.equal(snapshot.json.code, 'GROUP_NOT_FOUND');
});
