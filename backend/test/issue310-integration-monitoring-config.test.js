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
  User,
} = require('../models');

let server;
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

async function authHeadersFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
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
  await IntegrationTokenReference.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('team leader can create and update monitoring integration config without exposing token refs in read responses', async () => {
  const leader = await User.create({
    email: 'integration-owner@example.edu',
    fullName: 'Integration Owner',
    studentId: '11070003102',
    role: 'STUDENT',
    status: 'ACTIVE',
    password: 'StrongPass1!',
  });

  await Group.create({
    id: 'team-integrations',
    name: 'Group team-integrations',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
  });

  const createResult = await request('/api/v1/teams/team-integrations/integrations', {
    method: 'POST',
    headers: await authHeadersFor(leader),
    body: JSON.stringify({
      providerSet: ['GITHUB', 'JIRA'],
      organizationName: 'acme-org',
      repositoryName: 'senior-app',
      jiraWorkspaceId: 'workspace-acme',
      jiraProjectKey: 'SPM',
      defaultBranch: 'main',
      githubTokenRef: 'vault://github/team-integrations',
      jiraTokenRef: 'vault://jira/team-integrations',
      initiatedBy: String(leader.id),
    }),
  });

  assert.equal(createResult.response.status, 201);
  assert.equal(createResult.json.status, 'ACTIVE');
  assert.equal(createResult.json.hasGithubTokenRef, true);
  assert.equal(createResult.json.hasJiraTokenRef, true);
  assert.equal(createResult.json.githubTokenRef, undefined);
  assert.equal(createResult.json.jiraTokenRef, undefined);

  const updateResult = await request('/api/v1/teams/team-integrations/integrations', {
    method: 'PUT',
    headers: await authHeadersFor(leader),
    body: JSON.stringify({
      providerSet: ['GITHUB', 'JIRA'],
      organizationName: 'acme-org',
      repositoryName: 'senior-app-web',
      jiraWorkspaceId: 'workspace-acme',
      jiraProjectKey: 'SPM',
      defaultBranch: 'develop',
      initiatedBy: String(leader.id),
    }),
  });

  assert.equal(updateResult.response.status, 200);
  assert.equal(updateResult.json.repositoryName, 'senior-app-web');
  assert.equal(updateResult.json.defaultBranch, 'develop');
  assert.equal(updateResult.json.hasGithubTokenRef, true);
  assert.equal(updateResult.json.hasJiraTokenRef, true);

  const readResult = await request('/api/v1/teams/team-integrations/integrations', {
    headers: await authHeadersFor(leader),
  });

  assert.equal(readResult.response.status, 200);
  assert.equal(readResult.json.organizationName, 'acme-org');
  assert.equal(readResult.json.repositoryName, 'senior-app-web');
  assert.equal(readResult.json.defaultBranch, 'develop');
  assert.equal(readResult.json.hasGithubTokenRef, true);
  assert.equal(readResult.json.hasJiraTokenRef, true);
  assert.equal(readResult.json.githubTokenRef, undefined);
  assert.equal(readResult.json.jiraTokenRef, undefined);
});

test('update integration returns 404 when no binding exists yet', async () => {
  const leader = await User.create({
    email: 'integration-missing@example.edu',
    fullName: 'Integration Missing',
    studentId: '11070003103',
    role: 'STUDENT',
    status: 'ACTIVE',
    password: 'StrongPass1!',
  });

  await Group.create({
    id: 'team-integrations-missing',
    name: 'Group team-integrations-missing',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
  });

  const result = await request('/api/v1/teams/team-integrations-missing/integrations', {
    method: 'PUT',
    headers: await authHeadersFor(leader),
    body: JSON.stringify({
      providerSet: ['GITHUB', 'JIRA'],
      organizationName: 'acme-org',
      repositoryName: 'senior-app',
      jiraWorkspaceId: 'workspace-acme',
      jiraProjectKey: 'SPM',
      defaultBranch: 'main',
      initiatedBy: String(leader.id),
    }),
  });

  assert.equal(result.response.status, 404);
  assert.equal(result.json.code, 'INTEGRATION_BINDING_NOT_FOUND');
});

test('integration read preserves non-active binding statuses when token refs exist', async () => {
  const leader = await User.create({
    email: 'integration-invalid@example.edu',
    fullName: 'Integration Invalid',
    studentId: '11070003104',
    role: 'STUDENT',
    status: 'ACTIVE',
    password: 'StrongPass1!',
  });

  await Group.create({
    id: 'team-integrations-invalid',
    name: 'Group team-integrations-invalid',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
  });

  await IntegrationBinding.create({
    teamId: 'team-integrations-invalid',
    providerSet: ['GITHUB', 'JIRA'],
    organizationName: 'acme-org',
    repositoryName: 'senior-app',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    defaultBranch: 'main',
    initiatedBy: String(leader.id),
    status: 'INVALID',
  });
  await IntegrationTokenReference.create({
    teamId: 'team-integrations-invalid',
    githubTokenRef: 'vault://github/team-integrations-invalid',
    jiraTokenRef: 'vault://jira/team-integrations-invalid',
  });

  const result = await request('/api/v1/teams/team-integrations-invalid/integrations', {
    headers: await authHeadersFor(leader),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.status, 'INVALID');
});
