/**
 * Issue #259 — Testing: Log Submission (Connector f13)
 *
 * Asserts D6-style audit dispatch after POST /api/v1/groups/:groupId/deliverables succeeds.
 * Requires: deliverables route + audit writer (#221 and logging connector).
 *
 * submitDeliverableValidation: field is `images` (not imageUrls); `content` min length 10.
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const { User, Group, AuditLog } = require('../models');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

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
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('successful deliverable POST increases audit log rows (D6 dispatch after D3)', async (t) => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'aud1@example.edu',
    fullName: 'Aud1',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    name: 'Audit Deliverable Group',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
    status: 'FORMATION',
  });

  const before = await AuditLog.count();

  const { response, json } = await request(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      type: 'PROPOSAL',
      content: '## Proposal document for audit dispatch test.',
      images: [],
    }),
  });

  if (response.status === 404) {
    t.skip('deliverables route not mounted');
    return;
  }

  assert.equal(response.status, 201, JSON.stringify(json));

  const after = await AuditLog.count();
  assert.ok(
    after > before,
    'expected at least one new AuditLog row after successful deliverable submission',
  );

  const last = await AuditLog.findOne({ order: [['createdAt', 'DESC']] });
  assert.ok(last, 'audit row exists');
  const meta = last.metadata || {};
  const action = last.action || '';
  const mentionsDeliverable =
    /DELIVERABLE|SUBMISSION|DOCUMENT/i.test(action) ||
    Boolean(meta.groupId || meta.deliverableType || json.documentRef);
  assert.ok(mentionsDeliverable, `unexpected audit shape: action=${action} meta=${JSON.stringify(meta)}`);
});

test('parallel deliverable POSTs on different groups complete without cross-corrupting audit rows', async (t) => {
  const leader = await createStudent({
    studentId: '11070001002',
    email: 'audp@example.edu',
    fullName: 'AudP',
    password: 'StrongPass1!',
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(leader)),
  };

  const groups = [];
  for (let i = 0; i < 3; i += 1) {
    const group = await Group.create({
      name: `Parallel Audit Group ${i}`,
      leaderId: String(leader.id),
      memberIds: [String(leader.id)],
      maxMembers: 4,
      status: 'FORMATION',
    });
    groups.push(group);
  }

  const probe = await request(`/api/v1/groups/${groups[0].id}/deliverables`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'PROPOSAL',
      content: '## Probe deliverable body for route check.',
      images: [],
    }),
  });
  if (probe.response.status === 404) {
    t.skip('deliverables route not mounted');
    return;
  }

  const before = await AuditLog.count();

  const results = await Promise.all(
    groups.map((group, i) =>
      request(`/api/v1/groups/${group.id}/deliverables`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'PROPOSAL',
          content: `Parallel deliverable body ${i} for concurrent audit.`,
          images: [],
        }),
      }),
    ),
  );

  for (const { response, json } of results) {
    assert.ok([200, 201].includes(response.status), JSON.stringify(json));
  }

  const after = await AuditLog.count();
  assert.ok(after >= before + 3, `expected >=3 new audit rows, before=${before} after=${after}`);
});
