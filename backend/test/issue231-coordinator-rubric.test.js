require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const sequelize = require('../db');
const app = require('../app');
require('../models');
const { User, GradingRubric } = require('../models');

let server;
let baseUrl;

function authHeader(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function createCoordinator(email) {
  return User.create({
    email,
    fullName: 'Test Coordinator',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('Pass1!', 10),
  });
}

async function createStudent(email) {
  return User.create({
    email,
    fullName: 'Test Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    password: await bcrypt.hash('Pass1!', 10),
  });
}

async function req(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

const validCriteria = [
  { name: 'Problem Statement', maxPoints: 20 },
  { name: 'Technical Approach', maxPoints: 30 },
  { name: 'Team Plan', maxPoints: 50 },
];

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
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  await GradingRubric.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('PUT /api/v1/coordinator/rubrics — 401 when unauthenticated', async () => {
  const { response } = await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliverableType: 'PROPOSAL', criteria: validCriteria }),
  });
  assert.equal(response.status, 401);
});

test('PUT /api/v1/coordinator/rubrics — 403 when authenticated as STUDENT', async () => {
  const student = await createStudent('student@test.com');
  const { response } = await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader(student) },
    body: JSON.stringify({ deliverableType: 'PROPOSAL', criteria: validCriteria }),
  });
  assert.equal(response.status, 403);
});

test('PUT /api/v1/coordinator/rubrics — 400 when deliverableType missing', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const { response, json } = await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader(coordinator) },
    body: JSON.stringify({ criteria: validCriteria }),
  });
  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
});

test('PUT /api/v1/coordinator/rubrics — 400 when criteria is empty array', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const { response, json } = await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader(coordinator) },
    body: JSON.stringify({ deliverableType: 'PROPOSAL', criteria: [] }),
  });
  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
});

test('PUT /api/v1/coordinator/rubrics — 400 when criteria has duplicate names', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const { response, json } = await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader(coordinator) },
    body: JSON.stringify({
      deliverableType: 'PROPOSAL',
      criteria: [
        { name: 'Design', maxPoints: 50 },
        { name: 'Design', maxPoints: 50 },
      ],
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(json.code, 'DUPLICATE_CRITERION_NAME');
});

test('PUT /api/v1/coordinator/rubrics — 200 creates rubric and returns persisted data', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const { response, json } = await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader(coordinator) },
    body: JSON.stringify({ deliverableType: 'PROPOSAL', criteria: validCriteria }),
  });
  assert.equal(response.status, 200);
  assert.equal(json.code, 'SUCCESS');
  assert.equal(json.rubric.deliverableType, 'PROPOSAL');
  assert.deepEqual(json.rubric.criteria, validCriteria);
  assert.ok(json.rubric.id);
});

test('PUT /api/v1/coordinator/rubrics — second PUT for same deliverableType updates, not duplicates', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const headers = { 'Content-Type': 'application/json', ...authHeader(coordinator) };

  await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ deliverableType: 'SOW', criteria: validCriteria }),
  });

  const updated = [{ name: 'Updated Criterion', maxPoints: 100 }];
  const { response, json } = await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ deliverableType: 'SOW', criteria: updated }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(json.rubric.criteria, updated);

  const count = await GradingRubric.count({ where: { deliverableType: 'SOW' } });
  assert.equal(count, 1);
});

test('GET /api/v1/coordinator/rubrics — 200 returns list of all rubrics', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const headers = { 'Content-Type': 'application/json', ...authHeader(coordinator) };

  await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ deliverableType: 'PROPOSAL', criteria: validCriteria }),
  });

  const { response, json } = await req('/api/v1/coordinator/rubrics', {
    method: 'GET',
    headers,
  });

  assert.equal(response.status, 200);
  assert.equal(json.code, 'SUCCESS');
  assert.equal(json.rubrics.length, 1);
  assert.equal(json.rubrics[0].deliverableType, 'PROPOSAL');
});

test('GET /api/v1/coordinator/rubrics/:deliverableType — 404 when no rubric configured', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const { response, json } = await req('/api/v1/coordinator/rubrics/PROPOSAL', {
    method: 'GET',
    headers: authHeader(coordinator),
  });
  assert.equal(response.status, 404);
  assert.equal(json.code, 'RUBRIC_NOT_FOUND');
});

test('GET /api/v1/coordinator/rubrics/:deliverableType — 200 returns specific rubric', async () => {
  const coordinator = await createCoordinator('coord@test.com');
  const headers = { 'Content-Type': 'application/json', ...authHeader(coordinator) };

  await req('/api/v1/coordinator/rubrics', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ deliverableType: 'SOW', criteria: validCriteria }),
  });

  const { response, json } = await req('/api/v1/coordinator/rubrics/SOW', {
    method: 'GET',
    headers,
  });

  assert.equal(response.status, 200);
  assert.equal(json.rubric.deliverableType, 'SOW');
});
