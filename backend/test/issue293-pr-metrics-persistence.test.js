require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const sequelize = require('../db');
const app = require('../app');
const { IntegrationBinding, PrMetric } = require('../models');

let server;
let baseUrl;

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

async function createTeamBinding(teamId = 'team_01HR9W2Q6NQ7G6M3K4J8') {
  return IntegrationBinding.create({
    teamId,
    providerSet: ['github'],
    organizationName: 'senior-project',
    repositoryName: 'senior-app-1',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    defaultBranch: 'main',
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
  await PrMetric.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
});

test('stores synchronized PR metrics and returns ActionResponse status', async () => {
  await createTeamBinding();

  const { response, json } = await request('/internal/sprint-sync/pr-metrics', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      pullRequests: [
        {
          prNumber: 142,
          metricName: 'reviewReadinessScore',
          metricValue: 0.92,
          unit: 'ratio',
        },
        {
          prNumber: 142,
          metricName: 'reviewCycleHours',
          metricValue: 18,
          unit: 'hours',
        },
      ],
    }),
  });

  assert.equal(response.status, 201);
  assert.match(json.id, /^op_/);
  assert.equal(json.status, 'STORED');
  assert.equal(json.message, 'PR metrics stored successfully.');
  assert.equal(json.teamId, 'team_01HR9W2Q6NQ7G6M3K4J8');
  assert.equal(json.sprintId, 'sprint_2026_03');
  assert.equal(json.storedCount, 2);
  assert.ok(json.recordedAt);

  const storedMetrics = await PrMetric.findAll({
    where: {
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      prNumber: 142,
    },
    order: [['metricName', 'ASC']],
  });

  assert.equal(storedMetrics.length, 2);
  assert.equal(storedMetrics[0].metricName, 'reviewCycleHours');
  assert.equal(storedMetrics[0].metricValue, 18);
  assert.equal(storedMetrics[1].metricName, 'reviewReadinessScore');
  assert.equal(storedMetrics[1].metricValue, 0.92);
});

test('rejects invalid PR metric payloads with validation error response', async () => {
  const { response, json } = await request('/internal/sprint-sync/pr-metrics', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: '',
      pullRequests: [
        {
          prNumber: 0,
          metricName: 'reviewReadinessScore',
          metricValue: -1,
          unit: 'ratio',
        },
      ],
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.message, 'Validation failed');

  const storedMetrics = await PrMetric.findAll();
  assert.equal(storedMetrics.length, 0);
});

test('safely handles repeated PR metric submissions by updating existing rows', async () => {
  await createTeamBinding();

  const payload = {
    teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
    sprintId: 'sprint_2026_03',
    pullRequests: [
      {
        prNumber: 142,
        metricName: 'reviewReadinessScore',
        metricValue: 0.92,
        unit: 'ratio',
      },
    ],
  };

  await request('/internal/sprint-sync/pr-metrics', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(payload),
  });

  const { response } = await request('/internal/sprint-sync/pr-metrics', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      ...payload,
      pullRequests: [
        {
          ...payload.pullRequests[0],
          metricValue: 0.95,
        },
      ],
    }),
  });

  assert.equal(response.status, 201);

  const storedMetrics = await PrMetric.findAll({
    where: {
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      prNumber: 142,
      metricName: 'reviewReadinessScore',
    },
  });

  assert.equal(storedMetrics.length, 1);
  assert.equal(storedMetrics[0].metricValue, 0.95);
});

test('requires internal API key for PR metric persistence', async () => {
  const { response, json } = await request('/internal/sprint-sync/pr-metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      pullRequests: [],
    }),
  });

  assert.equal(response.status, 401);
  assert.equal(json.code, 'UNAUTHORIZED');
});
