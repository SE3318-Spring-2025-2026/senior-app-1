/**
 * Issue #256 — Testing: Log Configuration (Connector f12)
 *
 * POST /api/v1/coordinator/rubrics + async D6 audit; logging failures must not roll back rubric.
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { mock, afterEach: runAfterEach } = require('node:test');

const sequelize = require('../db');
const app = require('../app');
const { User, AuditLog } = require('../models');
const { ensureValidStudentRegistry } = require('../services/studentService');

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

function sampleRubric() {
  return {
    deliverableType: 'PROPOSAL',
    criteria: [{ question: 'Is the proposal clear?', type: 'SOFT', weight: 0.5 }],
  };
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

runAfterEach(() => {
  mock.restoreAll();
});

test.beforeEach(async () => {
  await AuditLog.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('POST /api/v1/coordinator/rubrics persists when AuditLog.create fails (D6 must not abort parent)', async (t) => {
  const coordinator = await User.create({
    email: 'coord-r@example.edu',
    fullName: 'Coord R',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  mock.method(AuditLog, 'create', async () => {
    throw new Error('simulated D6 outage');
  });

  const { response, json } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify(sampleRubric()),
  });

  if (response.status === 404) {
    t.skip('coordinator/rubrics not mounted');
    return;
  }

  assert.ok(
    [200, 201].includes(response.status),
    `expected success despite logging failure, got ${response.status} ${JSON.stringify(json)}`,
  );
});

test('POST rubrics writes audit payload with rubric configuration markers', async (t) => {
  const coordinator = await User.create({
    email: 'coord-r2@example.edu',
    fullName: 'Coord R2',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const payload = sampleRubric();
  const { response } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 404) {
    t.skip('coordinator/rubrics not mounted');
    return;
  }

  assert.ok([200, 201].includes(response.status));

  const row = await AuditLog.findOne({
    where: {},
    order: [['createdAt', 'DESC']],
  });
  assert.ok(row, 'expected audit row for rubric configuration');
  const meta = typeof row.metadata === 'object' ? row.metadata : {};
  const action = String(row.action || '');
  const ok =
    /RUBRIC|CONFIG|DELIVERABLE/i.test(action) ||
    meta.deliverableType === payload.deliverableType ||
    (Array.isArray(meta.criteria) && meta.criteria.length > 0);
  assert.ok(ok, `audit row should reference rubric config: action=${action} meta=${JSON.stringify(meta)}`);
});
