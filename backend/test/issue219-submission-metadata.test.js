require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const sequelize = require('../db');
const app = require('../app');
require('../models');
const { User, Group, DeliverableSubmission, ValidStudentId } = require('../models');

let server;
let baseUrl;

function authHeader(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function createStudent(overrides = {}) {
  const studentId = overrides.studentId || '11070001000';
  await ValidStudentId.findOrCreate({ where: { studentId } });
  return User.create({
    email: overrides.email || `student-${Date.now()}@test.com`,
    fullName: overrides.fullName || 'Test Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId,
    password: await bcrypt.hash('Pass1!', 10),
  });
}

async function createGroup(leaderId, memberIds = []) {
  return Group.create({
    name: 'Test Group',
    leaderId: String(leaderId),
    memberIds: memberIds.map(String),
    status: 'FORMATION',
  });
}

async function req(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

const validPayload = {
  sprintNumber: 1,
  deliverableType: 'PROPOSAL',
  documentRef: 'gs://bucket/groups/abc/sprint1-proposal.pdf',
};

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
  await DeliverableSubmission.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
  await ValidStudentId.destroy({ where: {} });
});

test('POST /api/v1/groups/:groupId/deliverables — 401 when unauthenticated', async () => {
  const { response } = await req('/api/v1/groups/fake-group-id/deliverables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload),
  });
  assert.equal(response.status, 401);
});

test('POST /api/v1/groups/:groupId/deliverables — 404 when group does not exist', async () => {
  const student = await createStudent({ email: 'a@test.com' });
  const { response, json } = await req('/api/v1/groups/nonexistent-group-id/deliverables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(student) },
    body: JSON.stringify(validPayload),
  });
  assert.equal(response.status, 404);
  assert.equal(json.code, 'GROUP_NOT_FOUND');
});

test('POST /api/v1/groups/:groupId/deliverables — 403 when user is not a group member', async () => {
  const leader = await createStudent({ email: 'leader@test.com', studentId: '11070001000' });
  const outsider = await createStudent({ email: 'outsider@test.com', studentId: '11070001001' });
  const group = await createGroup(leader.id, [String(leader.id)]);

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(outsider) },
    body: JSON.stringify(validPayload),
  });
  assert.equal(response.status, 403);
  assert.equal(json.code, 'NOT_A_MEMBER');
});

test('POST /api/v1/groups/:groupId/deliverables — 400 when sprintNumber is missing', async () => {
  const student = await createStudent({ email: 'a@test.com' });
  const group = await createGroup(student.id, [String(student.id)]);

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(student) },
    body: JSON.stringify({ deliverableType: 'PROPOSAL', documentRef: 'gs://bucket/file.pdf' }),
  });
  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
});

test('POST /api/v1/groups/:groupId/deliverables — 400 when documentRef is missing', async () => {
  const student = await createStudent({ email: 'a@test.com' });
  const group = await createGroup(student.id, [String(student.id)]);

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(student) },
    body: JSON.stringify({ sprintNumber: 1, deliverableType: 'PROPOSAL' }),
  });
  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
});

test('POST /api/v1/groups/:groupId/deliverables — 400 when deliverableType is invalid', async () => {
  const student = await createStudent({ email: 'a@test.com' });
  const group = await createGroup(student.id, [String(student.id)]);

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(student) },
    body: JSON.stringify({ sprintNumber: 1, deliverableType: 'INVALID', documentRef: 'gs://bucket/file.pdf' }),
  });
  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
});

test('POST /api/v1/groups/:groupId/deliverables — 201 creates submission and returns persisted record', async () => {
  const student = await createStudent({ email: 'a@test.com' });
  const group = await createGroup(student.id, [String(student.id)]);

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(student) },
    body: JSON.stringify(validPayload),
  });

  assert.equal(response.status, 201);
  assert.equal(json.code, 'CREATED');
  assert.ok(json.submission.id);
  assert.equal(json.submission.groupId, group.id);
  assert.equal(json.submission.sprintNumber, 1);
  assert.equal(json.submission.deliverableType, 'PROPOSAL');
  assert.equal(json.submission.documentRef, validPayload.documentRef);
  assert.equal(json.submission.submittedBy, student.id);
});

test('POST /api/v1/groups/:groupId/deliverables — 201 accepts optional metadata field', async () => {
  const student = await createStudent({ email: 'a@test.com' });
  const group = await createGroup(student.id, [String(student.id)]);

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(student) },
    body: JSON.stringify({ ...validPayload, metadata: { fileName: 'proposal.pdf', fileSize: 204800 } }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(json.submission.metadata, { fileName: 'proposal.pdf', fileSize: 204800 });
});

test('POST /api/v1/groups/:groupId/deliverables — member (non-leader) can also submit', async () => {
  const leader = await createStudent({ email: 'leader@test.com', studentId: '11070001000' });
  const member = await createStudent({ email: 'member@test.com', studentId: '11070001001' });
  const group = await createGroup(leader.id, [String(leader.id), String(member.id)]);

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(member) },
    body: JSON.stringify({ ...validPayload, deliverableType: 'SOW', sprintNumber: 2 }),
  });

  assert.equal(response.status, 201);
  assert.equal(json.submission.submittedBy, member.id);
});

test('GET /api/v1/groups/:groupId/deliverables — returns list of submissions for a group', async () => {
  const student = await createStudent({ email: 'a@test.com' });
  const group = await createGroup(student.id, [String(student.id)]);
  const headers = { 'Content-Type': 'application/json', ...authHeader(student) };

  await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers,
    body: JSON.stringify(validPayload),
  });
  await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...validPayload, sprintNumber: 2 }),
  });

  const { response, json } = await req(`/api/v1/groups/${group.id}/deliverables`, {
    method: 'GET',
    headers,
  });

  assert.equal(response.status, 200);
  assert.equal(json.submissions.length, 2);
});
