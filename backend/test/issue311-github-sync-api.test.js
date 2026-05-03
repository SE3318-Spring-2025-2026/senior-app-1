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
  User,
} = require('../models');

let server;
let baseUrl;
const originalFetch = global.fetch;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

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

async function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function createGithubReadyTeam({
  teamId = 'team-github-sync',
  leader,
  includeTokenRef = true,
  providerSet = ['GITHUB'],
} = {}) {
  const group = await Group.create({
    id: teamId,
    name: `Group ${teamId}`,
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
  });

  await IntegrationBinding.create({
    teamId,
    providerSet,
    organizationName: 'acme-org',
    repositoryName: 'senior-app-1',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    defaultBranch: 'main',
    initiatedBy: String(leader.id),
    status: 'ACTIVE',
  });

  if (includeTokenRef) {
    process.env[`GITHUB_TOKEN_REF_${String(`vault://github/${teamId}`)
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()}`] = `github-secret-for-${teamId}`;
    await IntegrationTokenReference.create({
      teamId,
      githubTokenRef: `vault://github/${teamId}`,
    });
  }

  return group;
}

test.before(async () => {
  await sequelize.sync({ force: true });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  global.fetch = originalFetch;

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await sequelize.close();
});

test.beforeEach(async () => {
  global.fetch = originalFetch;

  await SprintPullRequest.destroy({ where: {} });
  await IntegrationTokenReference.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('team leader can trigger GitHub sync, fetch repo pull requests, and persist matching PR data', async () => {
  const leader = await createStudentUser({
    email: 'github-sync-leader@example.edu',
    fullName: 'GitHub Sync Leader',
    studentId: '11070003111',
  });
  await createGithubReadyTeam({ leader });

  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith(baseUrl)) {
      return originalFetch(url, options);
    }

    assert.match(String(options?.headers?.Authorization || ''), /^token /);

    if (String(url).endsWith('/pulls?state=all&per_page=100')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([
          {
            number: 42,
            title: 'SPM-214 Fix login validation',
            body: 'Implements monitoring flow',
            head: { ref: 'SPM-214-login-validation' },
          },
          {
            number: 77,
            title: 'OPS-10 Infra change',
            body: 'Should be filtered out',
            head: { ref: 'OPS-10-maintenance' },
          },
        ]),
      };
    }

    if (String(url).endsWith('/pulls/42')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          number: 42,
          title: 'SPM-214 Fix login validation',
          body: 'Implements monitoring flow',
          state: 'open',
          merged: false,
          mergeable_state: 'clean',
          head: { ref: 'SPM-214-login-validation' },
          html_url: 'https://github.com/acme-org/senior-app-1/pull/42',
          created_at: '2026-05-02T10:00:00Z',
          updated_at: '2026-05-02T10:30:00Z',
          merged_at: null,
          additions: 10,
          deletions: 2,
          changed_files: 1,
        }),
      };
    }

    if (String(url).endsWith('/pulls/42/files?per_page=100')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([
          {
            filename: 'backend/controllers/authController.js',
            status: 'modified',
            additions: 10,
            deletions: 2,
            changes: 12,
          },
        ]),
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const { response, json } = await request('/api/v1/teams/team-github-sync/sprints/sprint_2026_03/github-verifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: String(leader.id),
      relatedIssueKeys: ['SPM-214'],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(json.code, 'SYNCED');
  assert.equal(json.data.teamId, 'team-github-sync');
  assert.equal(json.data.sprintId, 'sprint_2026_03');
  assert.equal(json.data.upstreamPullRequestCount, 1);
  assert.equal(json.data.storedPullRequestCount, 1);

  const storedPullRequest = await SprintPullRequest.findOne({
    where: {
      teamId: 'team-github-sync',
      sprintId: 'sprint_2026_03',
      prNumber: 42,
    },
  });
  assert.equal(storedPullRequest.relatedIssueKey, 'SPM-214');
  assert.equal(storedPullRequest.branchName, 'SPM-214-login-validation');
  assert.equal(storedPullRequest.prStatus, 'OPEN');
  assert.equal(storedPullRequest.mergeStatus, 'MERGEABLE');
});

test('github sync rejects requests without branch or issue filters', async () => {
  const leader = await createStudentUser({
    email: 'github-sync-empty-filters@example.edu',
    fullName: 'GitHub Sync Empty Filters',
    studentId: '11070003112',
  });
  await createGithubReadyTeam({ leader, teamId: 'team-github-sync-empty-filters' });

  const { response, json } = await request('/api/v1/teams/team-github-sync-empty-filters/sprints/sprint_2026_03/github-verifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: String(leader.id),
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.match(json.message, /Validation failed/);
});
