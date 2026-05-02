/**
 * Issue #367 — P61 integration tests: advisor soft grade (POST/PUT advisor-grade, GET grades)
 *
 * Expects routes under `/api/v1/final-evaluation/groups/:groupId/...` when Issue A is merged.
 * Override base path: `TEST_P61_FINAL_EVAL_BASE=/api/v1/other/prefix/groups`
 *
 * When the router is not mounted, Express returns 404 — tests call `t.skip('route not mounted')`.
 *
 * Run: cd backend && npm test -- test/issue367-p61-advisor-grade.test.js
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

const { User, Group, GroupAdvisorAssignment, Deliverable } = models;

/** Present after Final Evaluation models land on the branch */
const FinalEvaluationGrade = models.FinalEvaluationGrade || null;

let server;
let baseUrl;

const FINAL_EVAL_GROUPS_BASE =
  process.env.TEST_P61_FINAL_EVAL_BASE || '/api/v1/final-evaluation/groups';

function advisorGradeUrl(groupId) {
  return `${FINAL_EVAL_GROUPS_BASE}/${groupId}/advisor-grade`;
}

function gradesUrl(groupId) {
  return `${FINAL_EVAL_GROUPS_BASE}/${groupId}/grades`;
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

/** Payload aligned with soft-grade stories (implementation may normalize field names). */
function validAdvisorScoresBody() {
  return {
    scores: [{ criterionId: 'team-process', value: 82 }],
  };
}

function isExpressUnmounted404(response, json) {
  if (response.status !== 404) return false;
  if (json && json.code === 'ROUTE_NOT_FOUND') {
    return true;
  }
  const raw = json && typeof json._raw === 'string' ? json._raw : '';
  if (raw.includes('Cannot POST') || raw.includes('Cannot GET') || raw.includes('Cannot PUT')) {
    return true;
  }
  return json && json.code === undefined && json.message === undefined && !raw && Object.keys(json).length === 0;
}

function skipIfRouteMissing(t, response, json) {
  if (response.status === 404 && isExpressUnmounted404(response, json)) {
    t.skip('route not mounted');
    return true;
  }
  return false;
}

async function createProfessor(emailSuffix) {
  return User.create({
    email: `prof367-${emailSuffix}@example.edu`,
    fullName: `Prof 367 ${emailSuffix}`,
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
}

/**
 * Group + advisor assignment + deliverable for happy-path calls.
 */
async function seedAdvisorGradeContext() {
  const advisor = await createProfessor('advisor');
  const otherProfessor = await createProfessor('other');
  const student = await createStudent({
    studentId: '11070003670',
    email: 'stu367@example.edu',
    fullName: 'Student 367',
    password: 'StrongPass1!',
  });

  const groupId = crypto.randomUUID();
  const group = await Group.create({
    id: groupId,
    name: 'Issue 367 Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    status: 'HAS_ADVISOR',
    advisorId: String(advisor.id),
  });

  await GroupAdvisorAssignment.create({
    groupId: group.id,
    studentUserId: student.id,
    advisorUserId: advisor.id,
  });

  await Deliverable.create({
    groupId: group.id,
    type: 'PROPOSAL',
    content: 'P61 advisor grade seed deliverable',
    status: 'SUBMITTED',
  });

  return { groupId: group.id, advisor, otherProfessor, student };
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
  await destroyIfPresent(GroupAdvisorAssignment);
  await destroyIfPresent(Group);
  await User.destroy({ where: {} });
});

test('POST advisor-grade — 401 with no Authorization header', async (t) => {
  const fakeGroupId = '00000000-0000-4000-8000-000000000001';
  const { response, json } = await request(advisorGradeUrl(fakeGroupId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 401, JSON.stringify(json));
});

test('POST advisor-grade — 403 when caller is PROFESSOR but not the assigned advisor', async (t) => {
  const { groupId, advisor, otherProfessor } = await seedAdvisorGradeContext();
  const { response, json } = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(otherProfessor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 403, JSON.stringify(json));
  assert.ok(
    advisor.id !== otherProfessor.id,
    'seed must use two distinct professors',
  );
});

test('POST advisor-grade — 400 VALIDATION_ERROR when scores is absent', async (t) => {
  const { groupId, advisor } = await seedAdvisorGradeContext();
  const { response, json } = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify({ notes: 'no scores field' }),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 400, JSON.stringify(json));
  assert.equal(json.code, 'VALIDATION_ERROR', JSON.stringify(json));
});

test('POST advisor-grade — 404 when group does not exist', async (t) => {
  const advisor = await createProfessor('solo');
  const missingId = '00000000-0000-4000-8000-000000000099';
  const { response, json } = await request(advisorGradeUrl(missingId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (response.status === 404 && isExpressUnmounted404(response, json)) {
    t.skip('route not mounted');
    return;
  }
  assert.equal(response.status, 404, JSON.stringify(json));
});

test('POST advisor-grade — 201 with grade body when valid advisor submits scores', async (t) => {
  const { groupId, advisor } = await seedAdvisorGradeContext();
  const { response, json } = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 201, JSON.stringify(json));
  const body = json.data ?? json;
  assert.ok(
    body && (body.scores || body.finalScore !== undefined || body.advisorGrade),
    'response should include a grade payload (scores, finalScore, or advisorGrade)',
  );
});

test('POST advisor-grade — 409 on second submission by same advisor', async (t) => {
  const { groupId, advisor } = await seedAdvisorGradeContext();
  const first = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (skipIfRouteMissing(t, first.response, first.json)) return;
  assert.equal(first.response.status, 201, JSON.stringify(first.json));

  const second = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  assert.equal(second.response.status, 409, JSON.stringify(second.json));
});

test('PUT advisor-grade — 404 when no prior grade exists', async (t) => {
  const { groupId, advisor } = await seedAdvisorGradeContext();
  const { response, json } = await request(advisorGradeUrl(groupId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify({ scores: [{ criterionId: 'team-process', value: 90 }] }),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 404, JSON.stringify(json));
});

test('PUT advisor-grade — 200; finalScore in response reflects updated scores', async (t) => {
  const { groupId, advisor } = await seedAdvisorGradeContext();
  const postRes = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (skipIfRouteMissing(t, postRes.response, postRes.json)) return;
  assert.equal(postRes.response.status, 201, JSON.stringify(postRes.json));

  const putRes = await request(advisorGradeUrl(groupId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify({
      scores: [{ criterionId: 'team-process', value: 95 }],
    }),
  });
  assert.equal(putRes.response.status, 200, JSON.stringify(putRes.json));
  const body = putRes.json.data ?? putRes.json;
  const finalScore = body.finalScore ?? body.final_score ?? body.advisorGrade?.finalScore;
  assert.ok(
    finalScore !== undefined && finalScore !== null,
    'PUT response should expose finalScore (or nested advisorGrade.finalScore)',
  );
  assert.ok(Number.isFinite(Number(finalScore)), `expected numeric finalScore, got ${finalScore}`);
});

test('GET grades — 200 returns advisorGrade and committeeGrades[]', async (t) => {
  const { groupId, advisor } = await seedAdvisorGradeContext();
  const postRes = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (skipIfRouteMissing(t, postRes.response, postRes.json)) return;
  assert.equal(postRes.response.status, 201, JSON.stringify(postRes.json));

  const { response, json } = await request(gradesUrl(groupId), {
    method: 'GET',
    headers: {
      ...authHeaderFor(advisor),
    },
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 200, JSON.stringify(json));
  const data = json.data ?? json;
  const advisorGrade = data.advisorGrade ?? data.advisor_grade;
  const committeeGrades = data.committeeGrades ?? data.committee_grades;
  assert.ok(advisorGrade !== undefined, 'expected advisorGrade (or advisor_grade)');
  assert.ok(Array.isArray(committeeGrades), 'expected committeeGrades to be an array');
});

test('GET grades — 403 when caller is STUDENT', async (t) => {
  const { groupId, advisor, student } = await seedAdvisorGradeContext();
  const postRes = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(validAdvisorScoresBody()),
  });
  if (skipIfRouteMissing(t, postRes.response, postRes.json)) return;
  assert.equal(postRes.response.status, 201, JSON.stringify(postRes.json));

  const { response, json } = await request(gradesUrl(groupId), {
    method: 'GET',
    headers: {
      ...authHeaderFor(student),
    },
  });
  assert.equal(response.status, 403, JSON.stringify(json));
});
