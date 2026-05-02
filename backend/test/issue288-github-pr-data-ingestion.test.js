require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const sequelize = require('../db');
const app = require('../app');
const { IntegrationBinding, SprintPullRequest } = require('../models');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

function internalHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-internal-api-key': process.env.INTERNAL_API_KEY,
  };
}

let server;
let baseUrl;

async function createTeamBinding(teamId = 'team_01HR9W2Q6NQ7G6M3K4J8', providerSet = ['GITHUB']) {
  return IntegrationBinding.create({
    teamId,
    providerSet,
    organizationName: 'senior-project',
    repositoryName: 'senior-app-1',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    initiatedBy: 'student-1',
    status: 'ACTIVE',
  });
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
  await IntegrationBinding.destroy({ where: {} });
});

test('receives GitHub PR data, logs it, and returns ActionResponse status', async () => {
  await createTeamBinding();

  const originalInfo = console.info;
  const logCalls = [];
  console.info = (...args) => {
    logCalls.push(args);
  };

  try {
    const { response, json } = await request('/internal/github/pr-data', {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({
        teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
        sprintId: 'sprint_2026_03',
        receivedAt: '2026-04-23T12:20:00Z',
        pullRequests: [
          {
            prNumber: 142,
            issueKey: 'SPM-214',
            branchName: 'feature/SPM-214-evaluation-endpoint',
            prStatus: 'OPEN',
            mergeStatus: 'UNMERGED',
            diffSummary: 'Added evaluation controller and tests.',
            changedFiles: [
              'backend/controllers/evaluationController.js',
              'backend/test/evaluation.test.js',
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 201);
    assert.match(json.id, /^op_/);
    assert.equal(json.status, 'ACCEPTED');
    assert.equal(json.message, 'GitHub PR data received successfully.');
    assert.equal(json.teamId, 'team_01HR9W2Q6NQ7G6M3K4J8');
    assert.equal(json.sprintId, 'sprint_2026_03');
    assert.equal(json.receivedCount, 1);
    assert.ok(json.recordedAt);

    assert.ok(logCalls.length >= 1);
    assert.equal(logCalls[0][0], 'Received GitHub PR ingestion event');
    assert.equal(logCalls[0][1].teamId, 'team_01HR9W2Q6NQ7G6M3K4J8');
    assert.equal(logCalls[0][1].pullRequestCount, 1);
    assert.equal(logCalls[0][1].samplePullRequests[0].prNumber, 142);
    assert.equal(logCalls[0][1].samplePullRequests[0].issueKey, 'SPM-214');
  } finally {
    console.info = originalInfo;
  }
});

test('rejects malformed GitHub PR ingestion payloads', async () => {
  const { response, json } = await request('/internal/github/pr-data', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: '',
      receivedAt: 'not-a-date',
      pullRequests: [
        {
          prNumber: 0,
          branchName: '',
          prStatus: '',
          changedFiles: [''],
        },
      ],
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.message, 'Validation failed');
  assert.ok(Array.isArray(json.errors));
});

test('rejects duplicate pull request numbers in the same payload', async () => {
  await createTeamBinding();

  const { response, json } = await request('/internal/github/pr-data', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:20:00Z',
      pullRequests: [
        {
          prNumber: 142,
          branchName: 'feature/SPM-214-evaluation-endpoint',
          prStatus: 'OPEN',
        },
        {
          prNumber: 142,
          branchName: 'feature/SPM-214-follow-up',
          prStatus: 'MERGED',
        },
      ],
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.message, 'Duplicate pull requests in request payload');
  assert.equal(await SprintPullRequest.count(), 0);
});

test('requires an internal API key for GitHub PR ingestion', async () => {
  const { response, json } = await request('/internal/github/pr-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:20:00Z',
      pullRequests: [
        {
          prNumber: 142,
          branchName: 'feature/SPM-214-evaluation-endpoint',
          prStatus: 'OPEN',
        },
      ],
    }),
  });

  assert.equal(response.status, 401);
  assert.equal(json.code, 'UNAUTHORIZED');
  assert.equal(json.message, 'Valid internal API key is required');
});
