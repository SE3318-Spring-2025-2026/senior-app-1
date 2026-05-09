'use strict';

require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Force the AI service to use a stub before any controller picks it up.
const aiServiceModulePath = require.resolve('../services/aiService');
delete require.cache[aiServiceModulePath];

let pendingReviewResult = {
  status: 'REVIEWED',
  confidence: 0.92,
  reasoning: 'Reviewer left substantive feedback.',
};
let pendingValidationResult = {
  status: 'MATCHED',
  confidence: 0.88,
  feedback: 'Diff implements the issue end-to-end.',
};

require.cache[aiServiceModulePath] = {
  id: aiServiceModulePath,
  filename: aiServiceModulePath,
  loaded: true,
  exports: {
    isAvailable: () => true,
    classifyPrReview: async () => pendingReviewResult,
    classifyImplementation: async () => pendingValidationResult,
    resetForTests: () => {},
    DEFAULT_MODEL: 'stub-model',
  },
};

const sequelize = require('../db');
const app = require('../app');
const {
  User,
  IntegrationBinding,
  SprintPullRequest,
  AIValidationResult,
  AuditLog,
} = require('../models');

let server;
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { response, json };
}

function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

const TEAM_ID = 'team-ai-test-001';
const SPRINT_ID = 'sprint-ai-test-001';

async function seedSprintPr({ prNumber, issueKey = 'SPM-1', reviewVerified = 'PENDING' }) {
  return SprintPullRequest.create({
    teamId: TEAM_ID,
    sprintId: SPRINT_ID,
    prNumber,
    relatedIssueKey: issueKey,
    branchName: `feature/${issueKey}`,
    title: `Implement ${issueKey}`,
    prStatus: 'OPEN',
    mergeStatus: 'MERGEABLE',
    changedFiles: ['src/foo.js'],
    diffSummary: 'Adds foo',
    isActive: true,
    reviewVerified,
  });
}

async function createCoordinator() {
  return User.create({
    email: `coord-${uuidv4()}@example.com`,
    fullName: 'Coord AI',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
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
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  await AuditLog.destroy({ where: {} });
  await AIValidationResult.destroy({ where: {} });
  await SprintPullRequest.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
  await User.destroy({ where: {} });

  // Every test needs the binding row for the SprintPullRequest FK.
  await IntegrationBinding.create({
    teamId: TEAM_ID,
    providerSet: ['GITHUB'],
    status: 'ACTIVE',
    organizationName: 'test-org',
    repositoryName: 'test-repo',
    jiraProjectKey: 'TEST',
    initiatedBy: 'system',
  });

  pendingReviewResult = {
    status: 'REVIEWED',
    confidence: 0.92,
    reasoning: 'Reviewer left substantive feedback.',
  };
  pendingValidationResult = {
    status: 'MATCHED',
    confidence: 0.88,
    feedback: 'Diff implements the issue end-to-end.',
  };
});

test('POST /pr-review-verifications updates each PR with AI verdict', async () => {
  const coord = await createCoordinator();
  const pr = await seedSprintPr({ prNumber: 101 });

  const { response, json } = await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/pr-review-verifications`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaderFor(coord) },
    },
  );

  assert.equal(response.status, 202, JSON.stringify(json));
  assert.equal(json.code, 'ACCEPTED');
  assert.equal(json.data.processed, 1);
  assert.equal(json.data.results[0].reviewVerified, 'REVIEWED');

  const fresh = await SprintPullRequest.findByPk(pr.id);
  assert.equal(fresh.reviewVerified, 'REVIEWED');
  assert.ok(fresh.reviewConfidence > 0.9);
  assert.ok(fresh.reviewVerifiedAt);
});

test('GET /pr-review-verifications returns stored statuses', async () => {
  const coord = await createCoordinator();
  await seedSprintPr({ prNumber: 200, reviewVerified: 'NOT_REVIEWED' });

  const { response, json } = await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/pr-review-verifications`,
    { headers: authHeaderFor(coord) },
  );

  assert.equal(response.status, 200);
  assert.equal(json.data.pullRequests.length, 1);
  assert.equal(json.data.pullRequests[0].reviewVerified, 'NOT_REVIEWED');
});

test('POST /ai-validations stores an AIValidationResult and writes an audit log', async () => {
  const coord = await createCoordinator();

  const { response, json } = await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-validations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaderFor(coord) },
      body: JSON.stringify({
        issueKey: 'SPM-9001',
        issueDescription: 'Add aggregator endpoint that combines story+PR metrics.',
        fileDiffs: [{ path: 'src/aggregator.js', diff: '+ added implementation' }],
        prNumber: 42,
      }),
    },
  );

  assert.equal(response.status, 202, JSON.stringify(json));
  assert.equal(json.data.validationStatus, 'MATCHED');
  assert.equal(json.data.confidence, 0.88);

  const stored = await AIValidationResult.findOne({
    where: { teamId: TEAM_ID, sprintId: SPRINT_ID, issueKey: 'SPM-9001' },
  });
  assert.ok(stored);
  assert.equal(stored.prNumber, 42);

  // Audit log fires on next tick — give it a moment.
  await new Promise((r) => setTimeout(r, 30));
  const log = await AuditLog.findOne({
    where: { action: 'AI_VALIDATION_STORED', targetId: stored.id },
  });
  assert.ok(log, 'audit log row should exist');
});

test('POST /ai-validations upserts when called twice for the same issueKey', async () => {
  const coord = await createCoordinator();
  const headers = { 'Content-Type': 'application/json', ...authHeaderFor(coord) };
  const body = {
    issueKey: 'SPM-2002',
    issueDescription: 'Description',
    fileDiffs: [{ path: 'a.js', diff: '+ a' }],
  };

  await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-validations`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  );

  pendingValidationResult = {
    status: 'PARTIAL_MATCH',
    confidence: 0.5,
    feedback: 'Updated diff.',
  };

  await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-validations`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  );

  const all = await AIValidationResult.findAll({
    where: { teamId: TEAM_ID, sprintId: SPRINT_ID, issueKey: 'SPM-2002' },
  });
  assert.equal(all.length, 1, 'must upsert');
  assert.equal(all[0].validationStatus, 'PARTIAL_MATCH');
});

test('GET /ai-signals aggregates PR review and validation outcomes', async () => {
  const coord = await createCoordinator();
  await seedSprintPr({ prNumber: 301, reviewVerified: 'REVIEWED' });
  await seedSprintPr({ prNumber: 302, reviewVerified: 'NOT_REVIEWED' });
  await AIValidationResult.create({
    teamId: TEAM_ID,
    sprintId: SPRINT_ID,
    issueKey: 'SPM-301',
    validationStatus: 'MATCHED',
    confidence: 0.9,
  });
  await AIValidationResult.create({
    teamId: TEAM_ID,
    sprintId: SPRINT_ID,
    issueKey: 'SPM-302',
    validationStatus: 'PARTIAL_MATCH',
    confidence: 0.55,
  });

  const { response, json } = await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-signals`,
    { headers: authHeaderFor(coord) },
  );

  assert.equal(response.status, 200);
  assert.equal(json.data.pullRequestCount, 2);
  assert.equal(json.data.reviewedPullRequestCount, 1);
  assert.ok(Math.abs(json.data.reviewedRatio - 0.5) < 0.001);
  assert.equal(json.data.aiValidationCount, 2);
  // 1 MATCHED (1.0) + 1 PARTIAL (0.5) / 2 = 0.75
  assert.ok(Math.abs(json.data.matchedRatio - 0.75) < 0.001);
});

test('POST /ai-validations returns 401 without auth', async () => {
  const { response } = await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-validations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueKey: 'X', issueDescription: 'd', fileDiffs: [{ path: 'a', diff: 'b' }] }),
    },
  );
  assert.equal(response.status, 401);
});

test('POST /ai-validations returns 400 when fileDiffs missing', async () => {
  const coord = await createCoordinator();
  const { response, json } = await request(
    `/api/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-validations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaderFor(coord) },
      body: JSON.stringify({ issueKey: 'X', issueDescription: 'd' }),
    },
  );
  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
});

test('POST /internal/sprint-sync/ai-validations stores a batch with internal API key', async () => {
  const internalKey = process.env.INTERNAL_API_KEY || 'test-internal-key';
  process.env.INTERNAL_API_KEY = internalKey;

  const { response, json } = await request('/internal/sprint-sync/ai-validations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': internalKey,
    },
    body: JSON.stringify({
      teamId: TEAM_ID,
      sprintId: SPRINT_ID,
      validations: [
        { issueKey: 'SPM-AAA', validationStatus: 'MATCHED', confidence: 0.9, feedback: 'ok' },
        { issueKey: 'SPM-BBB', validationStatus: 'NOT_MATCHED', confidence: 0.4 },
      ],
    }),
  });

  assert.equal(response.status, 201, JSON.stringify(json));
  assert.equal(json.data.stored, 2);

  const rows = await AIValidationResult.findAll({
    where: { teamId: TEAM_ID, sprintId: SPRINT_ID },
  });
  assert.equal(rows.length, 2);
});
