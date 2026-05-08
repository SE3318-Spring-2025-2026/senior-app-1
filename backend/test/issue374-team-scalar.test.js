'use strict';

require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const sequelize = require('../db');
const app = require('../app');
const {
  User,
  Group,
  FinalEvaluationGrade,
  FinalEvaluationWeight,
  TeamScalar,
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

async function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function createUser(overrides = {}) {
  return User.create({
    email: `user-${uuidv4()}@example.com`,
    fullName: 'Test User',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
    ...overrides,
  });
}

async function createGroup() {
  const id = uuidv4();
  return Group.create({
    id,
    name: `Group-${id.slice(0, 8)}`,
    status: 'FINALIZED',
    memberIds: [],
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
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  await TeamScalar.destroy({ where: {} });
  await FinalEvaluationGrade.destroy({ where: {} });
  await FinalEvaluationWeight.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

// ─── POST /team-scalar ───────────────────────────────────────────────────────

test('POST team-scalar returns 401 when no auth token', async () => {
  const groupId = uuidv4();
  const { response } = await request(`/api/v1/final-evaluation/groups/${groupId}/team-scalar`, {
    method: 'POST',
  });
  assert.equal(response.status, 401);
});

test('POST team-scalar returns 403 when caller is not COORDINATOR', async () => {
  const professor = await createUser({ role: 'PROFESSOR' });
  const groupId = uuidv4();
  const { response } = await request(`/api/v1/final-evaluation/groups/${groupId}/team-scalar`, {
    method: 'POST',
    headers: { ...(await authHeaderFor(professor)) },
  });
  assert.equal(response.status, 403);
});

test('POST team-scalar returns 400 for invalid UUID groupId', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const { response } = await request('/api/v1/final-evaluation/groups/not-a-uuid/team-scalar', {
    method: 'POST',
    headers: { ...(await authHeaderFor(coordinator)) },
  });
  assert.equal(response.status, 400);
});

test('POST team-scalar returns 404 when group does not exist', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const groupId = uuidv4();
  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${groupId}/team-scalar`,
    {
      method: 'POST',
      headers: { ...(await authHeaderFor(coordinator)) },
    },
  );
  assert.equal(response.status, 404);
  assert.equal(json.code, 'GROUP_NOT_FOUND');
});

test('POST team-scalar returns 422 GRADES_INCOMPLETE when advisor grade is absent', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  await FinalEvaluationWeight.create({ advisorWeight: 0.4, committeeWeight: 0.6, isActive: true });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/team-scalar`,
    {
      method: 'POST',
      headers: { ...(await authHeaderFor(coordinator)) },
    },
  );
  assert.equal(response.status, 422);
  assert.equal(json.code, 'GRADES_INCOMPLETE');
});

test('POST team-scalar returns 422 GRADES_INCOMPLETE when no committee grades exist', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  await FinalEvaluationWeight.create({ advisorWeight: 0.4, committeeWeight: 0.6, isActive: true });
  const advisor = await createUser({ role: 'ADVISOR' });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'ADVISOR',
    gradedBy: advisor.id,
    scores: [],
    finalScore: 0.8,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/team-scalar`,
    {
      method: 'POST',
      headers: { ...(await authHeaderFor(coordinator)) },
    },
  );
  assert.equal(response.status, 422);
  assert.equal(json.code, 'GRADES_INCOMPLETE');
});

test('POST team-scalar returns 422 NO_WEIGHT_CONFIG when no weight config exists', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const advisor = await createUser({ role: 'ADVISOR' });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'ADVISOR',
    gradedBy: advisor.id,
    scores: [],
    finalScore: 0.8,
  });
  const member = await createUser({ role: 'PROFESSOR' });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'COMMITTEE',
    gradedBy: member.id,
    scores: [],
    finalScore: 0.7,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/team-scalar`,
    {
      method: 'POST',
      headers: { ...(await authHeaderFor(coordinator)) },
    },
  );
  assert.equal(response.status, 422);
  assert.equal(json.code, 'NO_WEIGHT_CONFIG');
});

test('POST team-scalar returns 200 with correct scalar on happy path', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const weightConfig = await FinalEvaluationWeight.create({
    advisorWeight: 0.4,
    committeeWeight: 0.6,
    isActive: true,
  });
  const advisor = await createUser({ role: 'ADVISOR' });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'ADVISOR',
    gradedBy: advisor.id,
    scores: [],
    finalScore: 0.8,
  });
  const member1 = await createUser({ role: 'PROFESSOR' });
  const member2 = await createUser({ role: 'PROFESSOR', email: `m2-${uuidv4()}@example.com` });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'COMMITTEE',
    gradedBy: member1.id,
    scores: [],
    finalScore: 0.6,
  });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'COMMITTEE',
    gradedBy: member2.id,
    scores: [],
    finalScore: 0.8,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/team-scalar`,
    {
      method: 'POST',
      headers: { ...(await authHeaderFor(coordinator)) },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(json.code, 'SUCCESS');
  const data = json.data;
  assert.equal(data.groupId, group.id);
  // advisorFinalScore=0.8, committeeFinalScore=(0.6+0.8)/2=0.7
  // scalar = 0.8*0.4 + 0.7*0.6 = 0.32 + 0.42 = 0.74
  assert.ok(Math.abs(data.scalar - 0.74) < 0.0001, `expected 0.74 got ${data.scalar}`);
  assert.ok(Math.abs(data.advisorFinalScore - 0.8) < 0.0001);
  assert.ok(Math.abs(data.committeeFinalScore - 0.7) < 0.0001);
  assert.equal(data.weightConfigId, weightConfig.id);
  assert.ok(data.calculatedAt);
});

test('POST team-scalar recalculates and overwrites existing scalar', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  await FinalEvaluationWeight.create({ advisorWeight: 0.5, committeeWeight: 0.5, isActive: true });
  const advisor = await createUser({ role: 'ADVISOR' });
  const member = await createUser({ role: 'PROFESSOR' });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'ADVISOR',
    gradedBy: advisor.id,
    scores: [],
    finalScore: 0.9,
  });
  await FinalEvaluationGrade.create({
    groupId: group.id,
    gradeType: 'COMMITTEE',
    gradedBy: member.id,
    scores: [],
    finalScore: 0.5,
  });

  const path = `/api/v1/final-evaluation/groups/${group.id}/team-scalar`;
  const headers = { ...(await authHeaderFor(coordinator)) };

  await request(path, { method: 'POST', headers });
  const { response, json } = await request(path, { method: 'POST', headers });

  assert.equal(response.status, 200);
  const rows = await TeamScalar.findAll({ where: { groupId: group.id } });
  assert.equal(rows.length, 1, 'should have exactly one TeamScalar row');
  assert.ok(Math.abs(json.data.scalar - 0.7) < 0.0001);
});

// ─── GET /team-scalar ────────────────────────────────────────────────────────

test('GET team-scalar returns 401 when no auth token', async () => {
  const groupId = uuidv4();
  const { response } = await request(`/api/v1/final-evaluation/groups/${groupId}/team-scalar`);
  assert.equal(response.status, 401);
});

test('GET team-scalar returns 403 when caller is STUDENT', async () => {
  const student = await createUser({ role: 'STUDENT', studentId: '11070001000' });
  const groupId = uuidv4();
  const { response } = await request(`/api/v1/final-evaluation/groups/${groupId}/team-scalar`, {
    headers: { ...(await authHeaderFor(student)) },
  });
  assert.equal(response.status, 403);
});

test('GET team-scalar returns 404 when scalar has not been calculated', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const groupId = uuidv4();
  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${groupId}/team-scalar`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );
  assert.equal(response.status, 404);
  assert.equal(json.code, 'TEAM_SCALAR_NOT_FOUND');
});

test('GET team-scalar returns 200 for COORDINATOR', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const weightConfig = await FinalEvaluationWeight.create({
    advisorWeight: 0.4,
    committeeWeight: 0.6,
    isActive: true,
  });
  await TeamScalar.create({
    groupId: group.id,
    scalar: 0.75,
    advisorFinalScore: 0.8,
    committeeFinalScore: 0.72,
    weightConfigId: weightConfig.id,
    calculatedAt: new Date(),
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/team-scalar`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );
  assert.equal(response.status, 200);
  assert.equal(json.code, 'SUCCESS');
  assert.equal(json.data.groupId, group.id);
  assert.ok(Math.abs(json.data.scalar - 0.75) < 0.0001);
});

test('GET team-scalar returns 200 for PROFESSOR', async () => {
  const professor = await createUser({ role: 'PROFESSOR' });
  const group = await createGroup();
  const weightConfig = await FinalEvaluationWeight.create({
    advisorWeight: 0.4,
    committeeWeight: 0.6,
    isActive: true,
  });
  await TeamScalar.create({
    groupId: group.id,
    scalar: 0.82,
    advisorFinalScore: 0.9,
    committeeFinalScore: 0.77,
    weightConfigId: weightConfig.id,
    calculatedAt: new Date(),
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/team-scalar`,
    { headers: { ...(await authHeaderFor(professor)) } },
  );
  assert.equal(response.status, 200);
  assert.equal(json.code, 'SUCCESS');
  assert.ok(Math.abs(json.data.scalar - 0.82) < 0.0001);
});
