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
  Deliverable,
  FinalEvaluationGrade,
  AuditLog,
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
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
    ...overrides,
  });
}

async function createGroup(overrides = {}) {
  const id = uuidv4();
  return Group.create({
    id,
    name: `Group-${id.slice(0, 8)}`,
    status: 'FORMATION',
    memberIds: [],
    advisorId: null,
    ...overrides,
  });
}

async function createDeliverable(groupId, overrides = {}) {
  return Deliverable.create({
    groupId,
    type: 'PROPOSAL',
    content: 'draft',
    images: [],
    status: 'SUBMITTED',
    version: 1,
    ...overrides,
  });
}

async function waitForAuditLog(where, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const row = await AuditLog.findOne({ where, order: [['createdAt', 'DESC']] });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
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
  await AuditLog.destroy({ where: {} });
  await FinalEvaluationGrade.destroy({ where: {} });
  await Deliverable.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('POST advisor-grade writes GRADE_SUBMITTED audit log with required metadata', async () => {
  const advisor = await createUser();
  const group = await createGroup({ advisorId: String(advisor.id) });
  const deliverable = await createDeliverable(group.id);

  const { response } = await request(`/api/v1/final-evaluation/groups/${group.id}/advisor-grade`, {
    method: 'POST',
    headers: {
      ...(await authHeaderFor(advisor)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deliverableId: deliverable.id,
      scores: [{ criterionId: 'c1', value: 0.9 }],
      comments: 'good',
    }),
  });

  assert.equal(response.status, 201);

  const log = await waitForAuditLog({ actorId: advisor.id, action: 'GRADE_SUBMITTED' });
  assert.ok(log);
  assert.equal(log.metadata.groupId, group.id);
  assert.equal(log.metadata.deliverableId, deliverable.id);
  assert.equal(log.metadata.graderRole, 'ADVISOR');
  assert.equal(log.metadata.gradeType, 'ADVISOR');
  assert.ok(log.metadata.timestamp);
});

test('POST committee-grade writes GRADE_SUBMITTED audit log with required metadata', async () => {
  const committeeMember = await createUser();
  const group = await createGroup();
  const deliverable = await createDeliverable(group.id);

  const { response } = await request(`/api/v1/final-evaluation/groups/${group.id}/committee-grade`, {
    method: 'POST',
    headers: {
      ...(await authHeaderFor(committeeMember)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deliverableId: deliverable.id,
      scores: [{ criterionId: 'c1', value: 0.8 }],
    }),
  });

  assert.equal(response.status, 201);

  const log = await waitForAuditLog({ actorId: committeeMember.id, action: 'GRADE_SUBMITTED' });
  assert.ok(log);
  assert.equal(log.metadata.groupId, group.id);
  assert.equal(log.metadata.deliverableId, deliverable.id);
  assert.equal(log.metadata.graderRole, 'COMMITTEE');
  assert.equal(log.metadata.gradeType, 'COMMITTEE');
  assert.ok(log.metadata.timestamp);
});

test('POST advisor-grade still returns 201 when AuditLog.create throws', async () => {
  const advisor = await createUser();
  const group = await createGroup({ advisorId: String(advisor.id) });
  const deliverable = await createDeliverable(group.id);

  const originalCreate = AuditLog.create;
  AuditLog.create = async () => {
    throw new Error('audit down');
  };

  try {
    const { response } = await request(`/api/v1/final-evaluation/groups/${group.id}/advisor-grade`, {
      method: 'POST',
      headers: {
        ...(await authHeaderFor(advisor)),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliverableId: deliverable.id,
        scores: [{ criterionId: 'c1', value: 0.7 }],
      }),
    });

    assert.equal(response.status, 201);
    const gradeCount = await FinalEvaluationGrade.count({ where: { groupId: group.id, gradedBy: advisor.id } });
    assert.equal(gradeCount, 1);
  } finally {
    AuditLog.create = originalCreate;
  }
});
