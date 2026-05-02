/**
 * Issue #369 — P61 integration tests: committee grade (POST/PUT committee-grade)
 *
 * Expects routes under `/api/v1/final-evaluation/groups/:groupId/committee-grade` when Issue C is merged.
 * Override base: `TEST_P61_FINAL_EVAL_BASE` (same as issue #367).
 *
 * Run: cd backend && npm test -- test/issue369-p61-committee-grade.test.js
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const sequelize = require('../db');
const app = require('../app');
const models = require('../models');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

const { User, Group, Deliverable } = models;

const FinalEvaluationGrade = models.FinalEvaluationGrade || null;

let server;
let baseUrl;

const FINAL_EVAL_GROUPS_BASE =
  process.env.TEST_P61_FINAL_EVAL_BASE || '/api/v1/final-evaluation/groups';

function committeeGradeUrl(groupId) {
  return `${FINAL_EVAL_GROUPS_BASE}/${groupId}/committee-grade`;
}

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

async function destroyIfPresent(Model) {
  if (Model) {
    await Model.destroy({ where: {} });
  }
}

function validCommitteeScoresBody() {
  return {
    scores: [{ criterionId: 'deliverable-quality', value: 88 }],
  };
}

function isRouteNotMounted404(response, json) {
  if (response.status !== 404) return false;
  if (json && json.code === 'ROUTE_NOT_FOUND') return true;
  const raw = json && typeof json._raw === 'string' ? json._raw : '';
  if (raw.includes('Cannot POST') || raw.includes('Cannot PUT')) return true;
  return (
    json &&
    json.code === undefined &&
    json.message === undefined &&
    !raw &&
    Object.keys(json).length === 0
  );
}

function skipIfRouteMissing(t, response, json) {
  if (response.status === 404 && isRouteNotMounted404(response, json)) {
    t.skip('route not mounted');
    return true;
  }
  return false;
}

async function createProfessor(suffix) {
  return User.create({
    email: `prof369-${suffix}@example.edu`,
    fullName: `Prof 369 ${suffix}`,
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
}

async function seedCommitteeContext() {
  const professorA = await createProfessor('reviewer-a');
  const professorB = await createProfessor('reviewer-b');
  const student = await createStudent({
    studentId: '11070003671',
    email: 'stu369@example.edu',
    fullName: 'Student 369',
    password: 'StrongPass1!',
  });

  const groupId = crypto.randomUUID();
  const group = await Group.create({
    id: groupId,
    name: 'Issue 369 Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    status: 'FORMATION',
  });

  await Deliverable.create({
    groupId: group.id,
    type: 'PROPOSAL',
    content: 'P61 committee grade seed deliverable',
    status: 'SUBMITTED',
  });

  return { groupId: group.id, professorA, professorB, student };
}

test.before(async () => {
  await sequelize.sync({ force: true });
  await ensureValidStudentRegistry();
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
  await destroyIfPresent(FinalEvaluationGrade);
  await destroyIfPresent(Deliverable);
  await destroyIfPresent(Group);
  await User.destroy({ where: {} });
});

test('POST committee-grade — 401 with no Authorization header', async (t) => {
  const fakeGroupId = '00000000-0000-4000-8000-000000000002';
  const { response, json } = await request(committeeGradeUrl(fakeGroupId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 401, JSON.stringify(json));
});

test('POST committee-grade — 403 when caller is STUDENT', async (t) => {
  const { groupId, student } = await seedCommitteeContext();
  const { response, json } = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(student),
    },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 403, JSON.stringify(json));
});

test('POST committee-grade — 400 VALIDATION_ERROR when scores is absent', async (t) => {
  const { groupId, professorA } = await seedCommitteeContext();
  const { response, json } = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify({ comment: 'missing scores' }),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 400, JSON.stringify(json));
  assert.equal(json.code, 'VALIDATION_ERROR', JSON.stringify(json));
});

test('POST committee-grade — 201 from a valid PROFESSOR account', async (t) => {
  const { groupId, professorA } = await seedCommitteeContext();
  const { response, json } = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 201, JSON.stringify(json));
  const body = json.data ?? json;
  assert.ok(
    body && (body.scores !== undefined || body.finalScore !== undefined || body.reviewerId !== undefined),
    'response should include grade fields',
  );
});

test('POST committee-grade — 409 on second submission by the same reviewer', async (t) => {
  const { groupId, professorA } = await seedCommitteeContext();
  const first = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  if (skipIfRouteMissing(t, first.response, first.json)) return;
  assert.equal(first.response.status, 201, JSON.stringify(first.json));

  const second = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  assert.equal(second.response.status, 409, JSON.stringify(second.json));
});

test('POST committee-grade — different PROFESSOR accounts can each submit (no 409)', async (t) => {
  const { groupId, professorA, professorB } = await seedCommitteeContext();
  const first = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  if (skipIfRouteMissing(t, first.response, first.json)) return;
  assert.equal(first.response.status, 201, JSON.stringify(first.json));

  const second = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorB),
    },
    body: JSON.stringify({
      scores: [{ criterionId: 'deliverable-quality', value: 91 }],
    }),
  });
  assert.equal(second.response.status, 201, JSON.stringify(second.json));
});

test('PUT committee-grade — 200; scores in response reflect new values', async (t) => {
  const { groupId, professorA } = await seedCommitteeContext();
  const postRes = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  if (skipIfRouteMissing(t, postRes.response, postRes.json)) return;
  assert.equal(postRes.response.status, 201, JSON.stringify(postRes.json));

  const updatedScores = [{ criterionId: 'deliverable-quality', value: 96 }];
  const putRes = await request(committeeGradeUrl(groupId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify({ scores: updatedScores }),
  });
  assert.equal(putRes.response.status, 200, JSON.stringify(putRes.json));
  const body = putRes.json.data ?? putRes.json;
  const scores = body.scores ?? body.committeeGrade?.scores;
  assert.ok(Array.isArray(scores), 'PUT response should include scores array');
  const first = scores[0];
  const val = first?.value ?? first?.score;
  assert.equal(Number(val), 96, JSON.stringify(scores));
});

test('PUT committee-grade — 403 when PUT caller is a different professor than the original submitter', async (t) => {
  const { groupId, professorA, professorB } = await seedCommitteeContext();
  const postRes = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorA),
    },
    body: JSON.stringify(validCommitteeScoresBody()),
  });
  if (skipIfRouteMissing(t, postRes.response, postRes.json)) return;
  assert.equal(postRes.response.status, 201, JSON.stringify(postRes.json));

  const putRes = await request(committeeGradeUrl(groupId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professorB),
    },
    body: JSON.stringify({
      scores: [{ criterionId: 'deliverable-quality', value: 50 }],
    }),
  });
  assert.equal(putRes.response.status, 403, JSON.stringify(putRes.json));
});
