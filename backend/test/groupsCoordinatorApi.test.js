/**
 * Issue #90 — PATCH /api/v1/groups/:groupId/membership/coordinator (add to npm test in same PR).
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
require('../models');
const { User, Group } = require('../models');
const groupsRepository = require('../repositories/groupsRepository');
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

test.beforeEach(async () => {
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('PATCH coordinator membership API: 200 ADD/REMOVE, 409 leader, 403 non-coordinator', async () => {
  const coordinator = await User.create({
    email: 'coord-api@example.edu',
    fullName: 'Coordinator API',
    role: 'COORDINATOR',
    status: 'ACTIVE',
  });

  await createStudent({
    studentId: '11070001000',
    email: 'lead-api@example.edu',
    fullName: 'Leader API',
    password: 'StrongPass1!',
  });
  await createStudent({
    studentId: '11070001001',
    email: 'member-api@example.edu',
    fullName: 'Member API',
    password: 'StrongPass1!',
  });

  const groupRow = await Group.create({
    name: 'API Test',
    leaderId: '11070001000',
    memberIds: ['11070001000'],
  });
  const gid = groupRow.id;

  const addFirst = await request(`/api/v1/groups/${gid}/membership/coordinator`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ action: 'ADD', studentId: '11070001001' }),
  });
  assert.equal(addFirst.response.status, 200);

  const removeLeader = await request(`/api/v1/groups/${gid}/membership/coordinator`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ action: 'REMOVE', studentId: '11070001000' }),
  });
  assert.equal(removeLeader.response.status, 409);
  assert.equal(removeLeader.json.code, groupsRepository.CODES.LEADER_REMOVAL_REQUIRES_REASSIGNMENT);

  const other = await createStudent({
    studentId: '11070001002',
    email: 'stu-api@example.edu',
    fullName: 'Student API',
    password: 'StrongPass1!',
  });
  const studentToken = jwt.sign({ id: other.id, role: other.role }, process.env.JWT_SECRET);
  const forbidden = await request(`/api/v1/groups/${gid}/membership/coordinator`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({ action: 'REMOVE', studentId: '11070001001' }),
  });
  assert.equal(forbidden.response.status, 403);
});
