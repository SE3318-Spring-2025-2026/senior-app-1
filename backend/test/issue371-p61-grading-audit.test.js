/**
 * Issue #371 — P61 integration tests: audit log after advisor / committee grade submission
 *
 * Verifies `GRADE_SUBMITTED` rows on successful POSTs and that `AuditLog.create` failures
 * do not fail the HTTP response (fire-and-forget), matching `issue261-committee-review-audit-logging.test.js`.
 *
 * Run: cd backend && npm test -- test/issue371-p61-grading-audit.test.js
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { mock, afterEach: runAfterEach } = require('node:test');

const sequelize = require('../db');
const app = require('../app');
const models = require('../models');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

const { User, Group, GroupAdvisorAssignment, Deliverable, AuditLog } = models;
const FinalEvaluationGrade = models.FinalEvaluationGrade || null;

let server;
let baseUrl;

const FINAL_EVAL_GROUPS_BASE =
  process.env.TEST_P61_FINAL_EVAL_BASE || '/api/v1/final-evaluation/groups';

function advisorGradeUrl(groupId) {
  return `${FINAL_EVAL_GROUPS_BASE}/${groupId}/advisor-grade`;
}

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

function isRouteNotMounted404(response, json) {
  if (response.status !== 404) return false;
  if (json && json.code === 'ROUTE_NOT_FOUND') return true;
  const raw = json && typeof json._raw === 'string' ? json._raw : '';
  if (raw.includes('Cannot POST')) return true;
  return false;
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
    email: `prof371-${suffix}@example.edu`,
    fullName: `Prof 371 ${suffix}`,
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
}

async function seedAdvisorContext() {
  const advisor = await createProfessor('advisor');
  const student = await createStudent({
    studentId: '11070003710',
    email: 'stu371-adv@example.edu',
    fullName: 'Student 371A',
    password: 'StrongPass1!',
  });
  const groupId = crypto.randomUUID();
  const group = await Group.create({
    id: groupId,
    name: 'Issue 371 Advisor Group',
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
    content: 'P371 advisor audit seed',
    status: 'SUBMITTED',
  });
  return { groupId: group.id, advisor };
}

async function seedCommitteeContext() {
  const professor = await createProfessor('committee');
  const student = await createStudent({
    studentId: '11070003711',
    email: 'stu371-com@example.edu',
    fullName: 'Student 371C',
    password: 'StrongPass1!',
  });
  const groupId = crypto.randomUUID();
  const group = await Group.create({
    id: groupId,
    name: 'Issue 371 Committee Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    status: 'FORMATION',
  });
  await Deliverable.create({
    groupId: group.id,
    type: 'PROPOSAL',
    content: 'P371 committee audit seed',
    status: 'SUBMITTED',
  });
  return { groupId: group.id, professor };
}

function scoresBody() {
  return { scores: [{ criterionId: 'audit-criterion', value: 84 }] };
}

runAfterEach(() => {
  mock.restoreAll();
});

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
  await AuditLog.destroy({ where: {} });
  await destroyIfPresent(FinalEvaluationGrade);
  await destroyIfPresent(Deliverable);
  await GroupAdvisorAssignment.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('after POST /advisor-grade succeeds, AuditLog count increases by 1 with action GRADE_SUBMITTED', async (t) => {
  const { groupId, advisor } = await seedAdvisorContext();
  const before = await AuditLog.count();

  const { response, json } = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(scoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 201, JSON.stringify(json));

  const after = await AuditLog.count();
  assert.equal(after, before + 1, 'expected exactly one new audit row');

  const latest = await AuditLog.findOne({
    order: [['createdAt', 'DESC']],
  });
  assert.ok(latest, 'audit row should exist');
  assert.equal(latest.action, 'GRADE_SUBMITTED', latest.action);
});

test('after POST /committee-grade succeeds, AuditLog count increases by 1 with action GRADE_SUBMITTED', async (t) => {
  const { groupId, professor } = await seedCommitteeContext();
  const before = await AuditLog.count();

  const { response, json } = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professor),
    },
    body: JSON.stringify(scoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 201, JSON.stringify(json));

  const after = await AuditLog.count();
  assert.equal(after, before + 1);

  const latest = await AuditLog.findOne({
    order: [['createdAt', 'DESC']],
  });
  assert.ok(latest);
  assert.equal(latest.action, 'GRADE_SUBMITTED');
});

test('when AuditLog.create throws, POST /advisor-grade still returns 201', async (t) => {
  const { groupId, advisor } = await seedAdvisorContext();

  mock.method(AuditLog, 'create', async () => {
    throw new Error('simulated D6 failure after advisor grade');
  });

  const { response, json } = await request(advisorGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify(scoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;

  assert.equal(
    response.status,
    201,
    `POST must succeed despite logging failure: ${JSON.stringify(json)}`,
  );
});

test('when AuditLog.create throws, POST /committee-grade still returns 201', async (t) => {
  const { groupId, professor } = await seedCommitteeContext();

  mock.method(AuditLog, 'create', async () => {
    throw new Error('simulated D6 failure after committee grade');
  });

  const { response, json } = await request(committeeGradeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professor),
    },
    body: JSON.stringify(scoresBody()),
  });
  if (skipIfRouteMissing(t, response, json)) return;

  assert.equal(
    response.status,
    201,
    `POST must succeed despite logging failure: ${JSON.stringify(json)}`,
  );
});
