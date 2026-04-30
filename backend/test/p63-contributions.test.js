'use strict';

require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const sequelize = require('../db');
const app = require('../app');
const { User, Group, SprintMemberRecord } = require('../models');

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
  await SprintMemberRecord.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

// ─── Auth / authz ────────────────────────────────────────────────────────────

test('GET contributions returns 401 when no auth token', async () => {
  const groupId = uuidv4();
  const { response } = await request(`/api/v1/final-evaluation/groups/${groupId}/contributions`);
  assert.equal(response.status, 401);
});

test('GET contributions returns 403 when caller is STUDENT', async () => {
  const student = await createUser({ role: 'STUDENT', studentId: '11070001000' });
  const groupId = uuidv4();
  const { response } = await request(
    `/api/v1/final-evaluation/groups/${groupId}/contributions`,
    { headers: { ...(await authHeaderFor(student)) } },
  );
  assert.equal(response.status, 403);
});

// ─── Validation ──────────────────────────────────────────────────────────────

test('GET contributions returns 400 for invalid UUID groupId', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const { response } = await request(
    '/api/v1/final-evaluation/groups/not-a-uuid/contributions',
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );
  assert.equal(response.status, 400);
});

// ─── 404 group not found ─────────────────────────────────────────────────────

test('GET contributions returns 404 when group does not exist', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const groupId = uuidv4();
  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${groupId}/contributions`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );
  assert.equal(response.status, 404);
  assert.equal(json.code, 'GROUP_NOT_FOUND');
});

// ─── 422 no sprint data ───────────────────────────────────────────────────────

test('GET contributions returns 422 NO_SPRINT_SYNC_DATA when no sprint records exist', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/contributions`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );
  assert.equal(response.status, 422);
  assert.equal(json.code, 'NO_SPRINT_SYNC_DATA');
});

// ─── 200 happy path ───────────────────────────────────────────────────────────

test('GET contributions returns 200 with correct ratios summing to 1.0', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const memberA = await createUser({ role: 'PROFESSOR', fullName: 'Alice' });
  const memberB = await createUser({ role: 'PROFESSOR', fullName: 'Bob' });

  await SprintMemberRecord.create({
    groupId: group.id, userId: memberA.id, sprintId: 'sprint-1',
    storyPointsCompleted: 3, commitCount: 5,
  });
  await SprintMemberRecord.create({
    groupId: group.id, userId: memberB.id, sprintId: 'sprint-1',
    storyPointsCompleted: 1, commitCount: 2,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/contributions`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );

  assert.equal(response.status, 200);
  assert.equal(json.code, 'SUCCESS');

  const data = json.data;
  assert.equal(data.groupId, group.id);
  assert.ok(data.computedAt);
  assert.equal(data.members.length, 2);

  const ratioSum = data.members.reduce((s, m) => s + m.contributionRatio, 0);
  assert.ok(Math.abs(ratioSum - 1.0) < 0.001, `ratios must sum to 1.0, got ${ratioSum}`);

  const alice = data.members.find((m) => m.userId === memberA.id);
  const bob = data.members.find((m) => m.userId === memberB.id);

  // totalStoryPoints = 4; alice=3/4=0.75, bob=1/4=0.25
  assert.ok(Math.abs(alice.contributionRatio - 0.75) < 0.001, `alice expected 0.75 got ${alice.contributionRatio}`);
  assert.ok(Math.abs(bob.contributionRatio - 0.25) < 0.001, `bob expected 0.25 got ${bob.contributionRatio}`);
  assert.equal(alice.storyPointsCompleted, 3);
  assert.equal(alice.totalCommits, 5);
  assert.equal(alice.fullName, 'Alice');
});

test('GET contributions aggregates story points across multiple sprints per member', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const memberA = await createUser({ role: 'PROFESSOR', fullName: 'Alice' });
  const memberB = await createUser({ role: 'PROFESSOR', fullName: 'Bob' });

  await SprintMemberRecord.create({
    groupId: group.id, userId: memberA.id, sprintId: 'sprint-1',
    storyPointsCompleted: 2, commitCount: 3,
  });
  await SprintMemberRecord.create({
    groupId: group.id, userId: memberA.id, sprintId: 'sprint-2',
    storyPointsCompleted: 2, commitCount: 2,
  });
  await SprintMemberRecord.create({
    groupId: group.id, userId: memberB.id, sprintId: 'sprint-1',
    storyPointsCompleted: 4, commitCount: 1,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/contributions`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );

  assert.equal(response.status, 200);
  const alice = json.data.members.find((m) => m.userId === memberA.id);
  const bob = json.data.members.find((m) => m.userId === memberB.id);

  // alice total = 4, bob total = 4, each = 50%
  assert.equal(alice.storyPointsCompleted, 4);
  assert.ok(Math.abs(alice.contributionRatio - 0.5) < 0.001);
  assert.ok(Math.abs(bob.contributionRatio - 0.5) < 0.001);
});

test('GET contributions falls back to commit ratio when all story points are 0', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const memberA = await createUser({ role: 'PROFESSOR', fullName: 'Alice' });
  const memberB = await createUser({ role: 'PROFESSOR', fullName: 'Bob' });

  await SprintMemberRecord.create({
    groupId: group.id, userId: memberA.id, sprintId: 'sprint-1',
    storyPointsCompleted: 0, commitCount: 3,
  });
  await SprintMemberRecord.create({
    groupId: group.id, userId: memberB.id, sprintId: 'sprint-1',
    storyPointsCompleted: 0, commitCount: 1,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/contributions`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );

  assert.equal(response.status, 200);
  const alice = json.data.members.find((m) => m.userId === memberA.id);
  const bob = json.data.members.find((m) => m.userId === memberB.id);

  // total commits = 4; alice=3/4=0.75, bob=1/4=0.25
  assert.ok(Math.abs(alice.contributionRatio - 0.75) < 0.001);
  assert.ok(Math.abs(bob.contributionRatio - 0.25) < 0.001);
});

test('GET contributions returns equal ratios when story points and commits are all 0', async () => {
  const coordinator = await createUser({ role: 'COORDINATOR' });
  const group = await createGroup();
  const memberA = await createUser({ role: 'PROFESSOR', fullName: 'Alice' });
  const memberB = await createUser({ role: 'PROFESSOR', fullName: 'Bob' });

  await SprintMemberRecord.create({
    groupId: group.id, userId: memberA.id, sprintId: 'sprint-1',
    storyPointsCompleted: 0, commitCount: 0,
  });
  await SprintMemberRecord.create({
    groupId: group.id, userId: memberB.id, sprintId: 'sprint-1',
    storyPointsCompleted: 0, commitCount: 0,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/contributions`,
    { headers: { ...(await authHeaderFor(coordinator)) } },
  );

  assert.equal(response.status, 200);
  const ratioSum = json.data.members.reduce((s, m) => s + m.contributionRatio, 0);
  assert.ok(Math.abs(ratioSum - 1.0) < 0.001);
  for (const m of json.data.members) {
    assert.ok(Math.abs(m.contributionRatio - 0.5) < 0.001);
  }
});

test('GET contributions returns 200 for PROFESSOR role', async () => {
  const professor = await createUser({ role: 'PROFESSOR' });
  const group = await createGroup();
  const member = await createUser({ role: 'PROFESSOR', fullName: 'Alice' });

  await SprintMemberRecord.create({
    groupId: group.id, userId: member.id, sprintId: 'sprint-1',
    storyPointsCompleted: 5, commitCount: 10,
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/groups/${group.id}/contributions`,
    { headers: { ...(await authHeaderFor(professor)) } },
  );

  assert.equal(response.status, 200);
  assert.equal(json.code, 'SUCCESS');
  assert.equal(json.data.members.length, 1);
  assert.ok(Math.abs(json.data.members[0].contributionRatio - 1.0) < 0.001);
});
