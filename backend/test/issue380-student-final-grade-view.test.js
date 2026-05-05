/**
 * Issue #380 — P64 Student view of own final grade
 *
 * GET /api/v1/final-evaluation/my-grade  (STUDENT only)
 *
 * Acceptance criteria:
 *   - 200 with StudentGradeView (userId, groupId, finalScore, letterGrade, finalizedAt)
 *   - Response does NOT include teamScalar, contributionRatio
 *   - 404 when coordinator has not finalized grades for student's group
 *   - 403 when caller is COORDINATOR or PROFESSOR
 *   - 401 with no Authorization header
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const { User, Group, MemberFinalGrade } = require('../models');
const { ensureValidStudentRegistry } = require('../services/studentService');

let server;
let baseUrl;

const GROUP_ID = 'bbbbcccc-dddd-eeee-ffff-aaaaaaaaaaaa';
const HASH = bcrypt.hashSync('StrongPass1!', 10);

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

function bearerHeader(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
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
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  await MemberFinalGrade.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

// ── 401 — no auth header ────────────────────────────────────────────────────

test('returns 401 when no Authorization header is provided', async () => {
  const { status } = await request('/api/v1/final-evaluation/my-grade');
  assert.equal(status, 401);
});

// ── 403 — wrong roles ────────────────────────────────────────────────────────

test('returns 403 when caller is COORDINATOR', async () => {
  const coordinator = await User.create({
    email: 'coord@test.com',
    fullName: 'Coord',
    role: 'COORDINATOR',
    password: HASH,
  });
  const { status } = await request('/api/v1/final-evaluation/my-grade', {
    headers: bearerHeader(coordinator),
  });
  assert.equal(status, 403);
});

test('returns 403 when caller is PROFESSOR', async () => {
  const professor = await User.create({
    email: 'prof@test.com',
    fullName: 'Prof',
    role: 'PROFESSOR',
    password: HASH,
  });
  const { status } = await request('/api/v1/final-evaluation/my-grade', {
    headers: bearerHeader(professor),
  });
  assert.equal(status, 403);
});

// ── 404 — no group found ────────────────────────────────────────────────────

test('returns 404 when student has no group', async () => {
  const student = await User.create({
    email: 'solo@test.com',
    studentId: '11111111111',
    fullName: 'Solo Student',
    role: 'STUDENT',
    password: HASH,
  });
  const { status, json } = await request('/api/v1/final-evaluation/my-grade', {
    headers: bearerHeader(student),
  });
  assert.equal(status, 404);
  assert.equal(json.code, 'GROUP_NOT_FOUND');
});

// ── 404 — group exists but grade not finalized ───────────────────────────────

test('returns 404 when coordinator has not finalized grades yet', async () => {
  const student = await User.create({
    email: 'ungraded@test.com',
    studentId: '22222222222',
    fullName: 'Ungraded Student',
    role: 'STUDENT',
    password: HASH,
  });

  await Group.create({
    id: GROUP_ID,
    name: 'Test Group',
    memberIds: [String(student.id)],
    status: 'FINALIZED',
  });

  const { status, json } = await request('/api/v1/final-evaluation/my-grade', {
    headers: bearerHeader(student),
  });
  assert.equal(status, 404);
  assert.equal(json.code, 'GRADE_NOT_FOUND');
});

// ── 200 — happy path ────────────────────────────────────────────────────────

test('returns 200 with StudentGradeView when grade is finalized', async () => {
  const student = await User.create({
    email: 'graded@test.com',
    studentId: '33333333333',
    fullName: 'Graded Student',
    role: 'STUDENT',
    password: HASH,
  });

  await Group.create({
    id: GROUP_ID,
    name: 'Test Group',
    memberIds: [String(student.id)],
    status: 'FINALIZED',
  });

  await MemberFinalGrade.create({
    groupId: GROUP_ID,
    userId: student.id,
    teamScalar: 80,
    contributionRatio: 50,
    finalScore: 40,
    letterGrade: 'F',
  });

  const { status, json } = await request('/api/v1/final-evaluation/my-grade', {
    headers: bearerHeader(student),
  });

  assert.equal(status, 200);
  assert.equal(json.userId, student.id);
  assert.equal(json.groupId, GROUP_ID);
  assert.equal(json.finalScore, 40);
  assert.equal(json.letterGrade, 'F');
  assert.ok(json.finalizedAt, 'finalizedAt should be present');

  // Sensitive fields must NOT be exposed
  assert.equal(json.teamScalar, undefined, 'teamScalar must not be exposed');
  assert.equal(json.contributionRatio, undefined, 'contributionRatio must not be exposed');
});

// ── 200 — student is one of many members ────────────────────────────────────

test('returns only the requesting student grade even when group has multiple members', async () => {
  const student = await User.create({
    email: 'membera@test.com',
    studentId: '44444444444',
    fullName: 'Member A',
    role: 'STUDENT',
    password: HASH,
  });
  const other = await User.create({
    email: 'memberb@test.com',
    studentId: '55555555555',
    fullName: 'Member B',
    role: 'STUDENT',
    password: HASH,
  });

  await Group.create({
    id: GROUP_ID,
    name: 'Multi Group',
    memberIds: [String(student.id), String(other.id)],
    status: 'FINALIZED',
  });

  await MemberFinalGrade.create({
    groupId: GROUP_ID,
    userId: student.id,
    teamScalar: 75,
    contributionRatio: 60,
    finalScore: 45,
    letterGrade: 'F',
  });
  await MemberFinalGrade.create({
    groupId: GROUP_ID,
    userId: other.id,
    teamScalar: 75,
    contributionRatio: 40,
    finalScore: 30,
    letterGrade: 'F',
  });

  const { status, json } = await request('/api/v1/final-evaluation/my-grade', {
    headers: bearerHeader(student),
  });

  assert.equal(status, 200);
  assert.equal(json.userId, student.id);
  assert.equal(json.finalScore, 45);
  // Other member's data not present
  assert.equal(json.members, undefined);
  assert.equal(json.teamScalar, undefined);
  assert.equal(json.contributionRatio, undefined);
});
