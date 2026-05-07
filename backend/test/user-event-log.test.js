require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
require('../models');
const models = require('../models');
const { User, AuditLog } = models;
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

let server;
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

async function authHeaderFor(user) {
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
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await sequelize.close();
});

async function destroyIfPresent(modelName) {
  const Model = models[modelName];
  if (Model) await Model.destroy({ where: {} });
}

test.beforeEach(async () => {
  await destroyIfPresent('AuditLog');
  await destroyIfPresent('LinkedGitHubAccount');
  await destroyIfPresent('OAuthState');
  await destroyIfPresent('GroupAdvisorAssignment');
  await destroyIfPresent('AdvisorRequest');
  await destroyIfPresent('Invitation');
  await destroyIfPresent('Notification');
  await destroyIfPresent('Group');
  await destroyIfPresent('Professor');
  await destroyIfPresent('User');
});

// ---------------------------------------------------------------------------
// Admin login
// ---------------------------------------------------------------------------

test('admin login success writes USER_LOGIN_SUCCESS audit log', async () => {
  const password = 'AdminPass2026!';
  await User.create({
    email: 'admin-log@example.com',
    fullName: 'Admin Logger',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const result = await request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin-log@example.com', password }),
  });

  assert.equal(result.response.status, 200);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_SUCCESS' } });
  assert.ok(log, 'USER_LOGIN_SUCCESS audit log should exist');
  assert.equal(log.targetType, 'USER');
  assert.equal(log.metadata.role, 'ADMIN');
});

test('admin login failure writes USER_LOGIN_FAILED audit log', async () => {
  const password = 'AdminPass2026!';
  await User.create({
    email: 'admin-fail@example.com',
    fullName: 'Admin Fail',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const result = await request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin-fail@example.com', password: 'WrongPass1!' }),
  });

  assert.equal(result.response.status, 401);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_FAILED' } });
  assert.ok(log, 'USER_LOGIN_FAILED audit log should exist');
  assert.equal(log.metadata.attemptedEmail, 'admin-fail@example.com');
  assert.equal(log.metadata.attemptedRole, 'ADMIN');
});

// ---------------------------------------------------------------------------
// Coordinator login
// ---------------------------------------------------------------------------

test('coordinator login success writes USER_LOGIN_SUCCESS audit log', async () => {
  const password = 'CoordPass2026!';
  await User.create({
    email: 'coord-log@example.com',
    fullName: 'Coord Logger',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const result = await request('/api/v1/coordinator/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'coord-log@example.com', password }),
  });

  assert.equal(result.response.status, 200);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_SUCCESS' } });
  assert.ok(log, 'USER_LOGIN_SUCCESS audit log should exist');
  assert.equal(log.metadata.role, 'COORDINATOR');
});

test('coordinator login failure writes USER_LOGIN_FAILED audit log', async () => {
  await User.create({
    email: 'coord-fail@example.com',
    fullName: 'Coord Fail',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('CoordPass2026!', 10),
  });

  const result = await request('/api/v1/coordinator/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'coord-fail@example.com', password: 'WrongPass1!' }),
  });

  assert.equal(result.response.status, 401);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_FAILED' } });
  assert.ok(log, 'USER_LOGIN_FAILED audit log should exist');
  assert.equal(log.metadata.attemptedRole, 'COORDINATOR');
});

// ---------------------------------------------------------------------------
// Student login
// ---------------------------------------------------------------------------

test('student login success writes USER_LOGIN_SUCCESS audit log', async () => {
  // 11070001000 is in the default valid-student-id registry seeded by ensureValidStudentRegistry
  await createStudent({
    studentId: '11070001000',
    email: 'student-log@example.edu',
    fullName: 'Student Logger',
    password: 'StrongPass1!',
  });

  const result = await request('/api/v1/students/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: '11070001000', password: 'StrongPass1!' }),
  });

  assert.equal(result.response.status, 200);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_SUCCESS' } });
  assert.ok(log, 'USER_LOGIN_SUCCESS audit log should exist');
  assert.equal(log.metadata.role, 'STUDENT');
});

test('student login failure writes USER_LOGIN_FAILED audit log', async () => {
  // 11070001001 is in the default valid-student-id registry
  await createStudent({
    studentId: '11070001001',
    email: 'student-fail@example.edu',
    fullName: 'Student Fail',
    password: 'StrongPass1!',
  });

  const result = await request('/api/v1/students/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: '11070001001', password: 'WrongPass1!' }),
  });

  assert.equal(result.response.status, 401);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_FAILED' } });
  assert.ok(log, 'USER_LOGIN_FAILED audit log should exist');
  assert.equal(log.metadata.attemptedStudentId, '11070001001');
  assert.equal(log.metadata.attemptedRole, 'STUDENT');
});

test('ineligible student login writes STUDENT_LOGIN_INELIGIBLE audit log', async () => {
  // 99999999999 is intentionally not in the valid-student-id registry
  const result = await request('/api/v1/students/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: '99999999999', password: 'SomePass1!' }),
  });

  assert.equal(result.response.status, 403);
  assert.equal(result.json.code, 'STUDENT_NOT_ELIGIBLE');

  const log = await AuditLog.findOne({ where: { action: 'STUDENT_LOGIN_INELIGIBLE' } });
  assert.ok(log, 'STUDENT_LOGIN_INELIGIBLE audit log should exist');
  assert.equal(log.metadata.attemptedStudentId, '99999999999');
});

// ---------------------------------------------------------------------------
// Professor login
// ---------------------------------------------------------------------------

test('professor login success writes USER_LOGIN_SUCCESS audit log', async () => {
  const password = 'ProfPass2026!';
  await User.create({
    email: 'prof-log@example.edu',
    fullName: 'Prof Logger',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const result = await request('/api/v1/professors/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'prof-log@example.edu', password }),
  });

  assert.equal(result.response.status, 200);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_SUCCESS' } });
  assert.ok(log, 'USER_LOGIN_SUCCESS audit log should exist');
  assert.equal(log.metadata.role, 'PROFESSOR');
});

test('professor login failure writes USER_LOGIN_FAILED audit log', async () => {
  await User.create({
    email: 'prof-fail@example.edu',
    fullName: 'Prof Fail',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('ProfPass2026!', 10),
  });

  const result = await request('/api/v1/professors/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'prof-fail@example.edu', password: 'WrongPass1!' }),
  });

  assert.equal(result.response.status, 401);

  const log = await AuditLog.findOne({ where: { action: 'USER_LOGIN_FAILED' } });
  assert.ok(log, 'USER_LOGIN_FAILED audit log should exist');
  assert.equal(log.metadata.attemptedEmail, 'prof-fail@example.edu');
  assert.equal(log.metadata.attemptedRole, 'PROFESSOR');
});

// ---------------------------------------------------------------------------
// Auth middleware events
// ---------------------------------------------------------------------------

test('missing token writes AUTH_TOKEN_MISSING audit log', async () => {
  const result = await request('/api/v1/admin/audit-logs');

  assert.equal(result.response.status, 401);
  assert.equal(result.json.code, 'AUTH_TOKEN_MISSING');

  const log = await AuditLog.findOne({ where: { action: 'AUTH_TOKEN_MISSING' } });
  assert.ok(log, 'AUTH_TOKEN_MISSING audit log should exist');
  assert.equal(log.targetType, 'ENDPOINT');
});

test('invalid token writes AUTH_TOKEN_INVALID audit log', async () => {
  const result = await request('/api/v1/admin/audit-logs', {
    headers: { Authorization: 'Bearer this.is.not.valid' },
  });

  assert.equal(result.response.status, 401);
  assert.equal(result.json.code, 'INVALID_TOKEN');

  const log = await AuditLog.findOne({ where: { action: 'AUTH_TOKEN_INVALID' } });
  assert.ok(log, 'AUTH_TOKEN_INVALID audit log should exist');
  assert.equal(log.targetType, 'ENDPOINT');
});

test('forbidden role access writes AUTH_FORBIDDEN audit log', async () => {
  const student = await createStudent({
    studentId: '11070009903',
    email: 'student-forbidden@example.edu',
    fullName: 'Forbidden Student',
    password: 'StrongPass1!',
  });

  const result = await request('/api/v1/admin/audit-logs', {
    headers: await authHeaderFor(student),
  });

  assert.equal(result.response.status, 403);

  const log = await AuditLog.findOne({ where: { action: 'AUTH_FORBIDDEN' } });
  assert.ok(log, 'AUTH_FORBIDDEN audit log should exist');
  assert.equal(log.actorId, student.id);
  assert.equal(log.metadata.userRole, 'STUDENT');
  assert.ok(Array.isArray(log.metadata.requiredRoles));
});

// ---------------------------------------------------------------------------
// Audit log filtering
// ---------------------------------------------------------------------------

test('audit log endpoint filters by action', async () => {
  const admin = await User.create({
    email: 'filter-admin@example.com',
    fullName: 'Filter Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash('AdminPass2026!', 10),
  });

  await AuditLog.create({
    action: 'USER_LOGIN_SUCCESS',
    actorId: admin.id,
    targetType: 'USER',
    targetId: String(admin.id),
    metadata: { role: 'ADMIN' },
  });
  await AuditLog.create({
    action: 'USER_LOGIN_FAILED',
    actorId: null,
    targetType: 'USER',
    targetId: null,
    metadata: { attemptedEmail: 'nobody@example.com' },
  });

  const result = await request('/api/v1/admin/audit-logs?action=USER_LOGIN_FAILED', {
    headers: await authHeaderFor(admin),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.count, 1);
  assert.equal(result.json.data[0].action, 'USER_LOGIN_FAILED');
});

test('audit log endpoint filters by targetType', async () => {
  const admin = await User.create({
    email: 'filter-type-admin@example.com',
    fullName: 'Filter Type Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash('AdminPass2026!', 10),
  });

  await AuditLog.create({
    action: 'AUTH_TOKEN_MISSING',
    actorId: null,
    targetType: 'ENDPOINT',
    targetId: '/api/v1/admin/audit-logs',
    metadata: {},
  });
  await AuditLog.create({
    action: 'USER_LOGIN_SUCCESS',
    actorId: admin.id,
    targetType: 'USER',
    targetId: String(admin.id),
    metadata: { role: 'ADMIN' },
  });

  const result = await request('/api/v1/admin/audit-logs?targetType=ENDPOINT', {
    headers: await authHeaderFor(admin),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.count, 1);
  assert.equal(result.json.data[0].targetType, 'ENDPOINT');
});

test('audit log endpoint returns all logs when no filter is given', async () => {
  const admin = await User.create({
    email: 'nofilter-admin@example.com',
    fullName: 'No Filter Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash('AdminPass2026!', 10),
  });

  await AuditLog.create({ action: 'USER_LOGIN_SUCCESS', actorId: admin.id, targetType: 'USER', targetId: String(admin.id), metadata: {} });
  await AuditLog.create({ action: 'USER_LOGIN_FAILED', actorId: null, targetType: 'USER', targetId: null, metadata: {} });

  const result = await request('/api/v1/admin/audit-logs', {
    headers: await authHeaderFor(admin),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.count, 2);
});

// ---------------------------------------------------------------------------
// Sensitive data must NOT be stored in metadata
// ---------------------------------------------------------------------------

test('failed login audit log does not store password in metadata', async () => {
  const password = 'AdminPass2026!';
  await User.create({
    email: 'no-pass-leak@example.com',
    fullName: 'No Pass Leak',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  await request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'no-pass-leak@example.com', password: 'WrongPass1!' }),
  });

  const logs = await AuditLog.findAll({ where: { action: 'USER_LOGIN_FAILED' } });
  for (const log of logs) {
    const meta = log.metadata || {};
    assert.equal(meta.password, undefined, 'password must not appear in metadata');
    assert.equal(meta.newPassword, undefined, 'newPassword must not appear in metadata');
    assert.equal(meta.token, undefined, 'token must not appear in metadata');
    assert.equal(meta.setupToken, undefined, 'setupToken must not appear in metadata');
    assert.equal(meta.authorization, undefined, 'authorization must not appear in metadata');
  }
});
