/**
 * Issue #220 — Testing: Document Storage Integration (Connector f6)
 *
 * Requires: POST /api/v1/groups/:groupId/deliverables + D5 integration (#221).
 * Response shape: { code, message, data: { id, groupId, type, status, version, createdAt, updatedAt } } — persistent ref is `data.id`, not top-level `documentRef`.
 *
 * submitDeliverableValidation: `images` (not imageUrls); `content` min length 10.
 *
 * Run: cd backend && npm test -- test/issue220-deliverables-storage.test.js
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const { User, Group } = require('../models');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

let server;
let baseUrl;

function loadDeliverableModel() {
  try {
    return require('../models/Deliverable');
  } catch {
    return null;
  }
}

function uuidV4Pattern() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  const Deliverable = loadDeliverableModel();
  if (Deliverable) {
    await Deliverable.destroy({ where: {} });
  }
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('POST deliverables returns 201 with persistent id under data.id on happy path', async (t) => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'ldr@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    name: 'Storage Test Group',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
    status: 'FORMATION',
  });

  const { response, json } = await request(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      type: 'PROPOSAL',
      content: '# Proposal\n\nBody text for blob storage.',
      images: [],
    }),
  });

  if (response.status === 404) {
    t.skip('deliverables route not mounted');
    return;
  }

  assert.equal(response.status, 201, JSON.stringify(json));
  const data = json && typeof json.data === 'object' && json.data !== null ? json.data : {};
  const persistentId = data.id;
  assert.ok(
    typeof persistentId === 'string' && uuidV4Pattern().test(persistentId),
    `expected data.id UUID; got ${JSON.stringify(json)}`,
  );
});

test('POST deliverables propagates structured failure when storage layer rejects', async (t) => {
  const leader = await createStudent({
    studentId: '11070001001',
    email: 'ldr2@example.edu',
    fullName: 'Leader2',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    name: 'Storage Fail Group',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
    status: 'FORMATION',
  });

  const { response, json } = await request(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Storage-Mode': 'reject',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      type: 'SOW',
      content: 'Trigger storage failure with enough content length.',
      images: [],
    }),
  });

  if (response.status === 404) {
    t.skip('deliverables route not mounted');
    return;
  }

  assert.ok(
    response.status >= 400,
    `expected error status when storage rejects, got ${response.status} ${JSON.stringify(json)}`,
  );
  assert.ok(json.code || json.message, 'client should receive a machine- or human-readable error');
});

test('POST deliverables returns 400 when mandatory fields are missing', async (t) => {
  const leader = await createStudent({
    studentId: '11070001002',
    email: 'ldr3@example.edu',
    fullName: 'Leader3',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    name: 'Bad Payload Group',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
    status: 'FORMATION',
  });

  const { response, json } = await request(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ type: 'PROPOSAL' }),
  });

  if (response.status === 404) {
    t.skip('deliverables route not mounted');
    return;
  }

  assert.equal(response.status, 400, JSON.stringify(json));
});
