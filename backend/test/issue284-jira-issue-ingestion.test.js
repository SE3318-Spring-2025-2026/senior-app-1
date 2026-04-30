require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const sequelize = require('../db');
const app = require('../app');
const { IntegrationBinding, StoryMetric } = require('../models');

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

async function createTeamBinding(teamId = 'team_01HR9W2Q6NQ7G6M3K4J8', providerSet = ['JIRA']) {
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
  await StoryMetric.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
});

test('receives Jira issues, normalizes them, and stores story point metrics', async () => {
  await createTeamBinding();

  const { response, json } = await request('/internal/jira/issues', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:10:00Z',
      issues: [
        {
          key: 'SPM-214',
          fields: {
            summary: 'Implement sprint evaluation aggregation endpoint',
            status: { name: 'In Progress' },
            customfield_10016: 5,
            assignee: { accountId: 'stu_20230017' },
            sprint: { id: 'sprint_2026_03' },
          },
        },
        {
          issueKey: 'SPM-215',
          title: 'Already normalized issue',
          status: 'DONE',
          storyPoints: 3,
          sprintId: 'sprint_2026_03',
        },
        {
          issueKey: 'SPM-216',
          title: 'Issue without story points',
          status: 'TO_DO',
          sprintId: 'sprint_2026_03',
        },
      ],
    }),
  });

  assert.equal(response.status, 201);
  assert.match(json.id, /^op_/);
  assert.equal(json.status, 'STORED');
  assert.equal(json.message, 'Jira issues received successfully.');
  assert.equal(json.teamId, 'team_01HR9W2Q6NQ7G6M3K4J8');
  assert.equal(json.sprintId, 'sprint_2026_03');
  assert.equal(json.receivedCount, 3);
  assert.equal(json.storedMetricCount, 2);
  assert.ok(json.recordedAt);

  const storedMetrics = await StoryMetric.findAll({
    where: {
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
    },
    order: [['issueKey', 'ASC']],
  });

  assert.equal(storedMetrics.length, 2);
  assert.equal(storedMetrics[0].issueKey, 'SPM-214');
  assert.equal(storedMetrics[0].metricName, 'storyPoints');
  assert.equal(storedMetrics[0].metricValue, 5);
  assert.equal(storedMetrics[0].unit, 'points');
  assert.equal(storedMetrics[1].issueKey, 'SPM-215');
  assert.equal(storedMetrics[1].metricValue, 3);
});

test('rejects invalid Jira issue ingestion payloads', async () => {
  const { response, json } = await request('/internal/jira/issues', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: '',
      receivedAt: 'not-a-date',
      issues: [],
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.success, false);
  assert.ok(Array.isArray(json.details));
});

test('rejects Jira issues that cannot be normalized into the required shape', async () => {
  await createTeamBinding();

  const { response, json } = await request('/internal/jira/issues', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:10:00Z',
      issues: [
        {
          fields: {
            description: 'Missing all required identifying fields',
          },
        },
      ],
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.match(json.message, /could not be normalized/i);
  assert.ok(Array.isArray(json.details));
});

test('rejects duplicate Jira issues in the same payload', async () => {
  await createTeamBinding();

  const { response, json } = await request('/internal/jira/issues', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:10:00Z',
      issues: [
        {
          issueKey: 'SPM-214',
          title: 'Duplicate issue one',
          status: 'IN_PROGRESS',
          sprintId: 'sprint_2026_03',
        },
        {
          issueKey: 'SPM-214',
          title: 'Duplicate issue two',
          status: 'DONE',
          sprintId: 'sprint_2026_03',
        },
      ],
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.message, 'Duplicate Jira issues in request payload');
  assert.equal(await StoryMetric.count(), 0);
});

test('rejects Jira issue ingestion for teams without an integration binding', async () => {
  const { response, json } = await request('/internal/jira/issues', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'missing-team',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:10:00Z',
      issues: [
        {
          issueKey: 'SPM-214',
          title: 'Missing team issue',
          status: 'IN_PROGRESS',
          sprintId: 'sprint_2026_03',
        },
      ],
    }),
  });

  assert.equal(response.status, 404);
  assert.equal(json.code, 'INTEGRATION_BINDING_NOT_FOUND');
});

test('requires Jira provider and valid internal API key for Jira issue ingestion', async () => {
  await createTeamBinding('team_non_jira', ['GITHUB']);

  const noProvider = await request('/internal/jira/issues', {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      teamId: 'team_non_jira',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:10:00Z',
      issues: [
        {
          issueKey: 'SPM-214',
          title: 'Wrong provider issue',
          status: 'IN_PROGRESS',
          sprintId: 'sprint_2026_03',
        },
      ],
    }),
  });

  assert.equal(noProvider.response.status, 409);
  assert.equal(noProvider.json.code, 'JIRA_PROVIDER_NOT_ENABLED');

  const unauthorized = await request('/internal/jira/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamId: 'team_non_jira',
      sprintId: 'sprint_2026_03',
      receivedAt: '2026-04-23T12:10:00Z',
      issues: [
        {
          issueKey: 'SPM-214',
          title: 'Unauthorized issue',
          status: 'IN_PROGRESS',
          sprintId: 'sprint_2026_03',
        },
      ],
    }),
  });

  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.json.code, 'UNAUTHORIZED');
});
