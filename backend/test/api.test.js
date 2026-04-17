require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
require('../models');
const {
  User,
  Group,
  Professor,
  GroupAdvisorAssignment,
  AdvisorRequest,
  AuditLog,
  Notification,
  LinkedGitHubAccount,
  OAuthState,
} = require('../models');

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

async function createProfessorUser({ email, fullName, department = 'Software Engineering' }) {
  const user = await User.create({
    email,
    fullName,
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  await Professor.create({
    userId: user.id,
    department,
    fullName,
  });

  return user;
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
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  await GroupAdvisorAssignment.destroy({ where: {} });
  await AdvisorRequest.destroy({ where: {} });
  await Notification.destroy({ where: {} });
  await AuditLog.destroy({ where: {} });
  await GroupAdvisorAssignment.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await LinkedGitHubAccount.destroy({ where: {} });
  await OAuthState.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('DELETE /api/v1/groups/:groupId/advisor-assignment: RBAC, removal, status, log, notification', async () => {
  // Setup users
  const admin = await User.create({
    email: 'admin-rbac@example.com',
    fullName: 'Admin User',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: 'irrelevant',
  });
  const coordinator = await User.create({
    email: 'coord-rbac@example.com',
    fullName: 'Coord User',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: 'irrelevant',
  });
  const advisor = await User.create({
    email: 'advisor-rbac@example.com',
    fullName: 'Advisor User',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: 'irrelevant',
  });
  const leader = await User.create({
    email: 'leader-rbac@example.com',
    fullName: 'Leader User',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001000',
    password: 'irrelevant',
  });

  // Create group with advisor assigned
  const group = await Group.create({
    name: 'Advisor Test',
    leaderId: leader.id,
    memberIds: [leader.id],
    advisorId: advisor.id,
    status: 'HAS_ADVISOR',
    maxMembers: 4,
  });

  // ADMIN can remove advisor
  let res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(admin),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');
  
  const updated = await Group.findByPk(group.id);
  assert.equal(updated.advisorId, null);
  assert.equal(updated.status, 'LOOKING_FOR_ADVISOR');

  // Re-assign advisor for next tests
  await updated.reload();
  updated.advisorId = advisor.id;
  updated.status = 'HAS_ADVISOR';
  await updated.save();

  // COORDINATOR can remove advisor
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(coordinator),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');

  // Re-assign advisor for next tests
  await updated.reload();
  updated.advisorId = advisor.id;
  updated.status = 'HAS_ADVISOR';
  await updated.save();

  // Current advisor can remove self
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(advisor),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');

  // Unauthorized student cannot remove advisor
  await updated.reload();
  updated.advisorId = advisor.id;
  updated.status = 'HAS_ADVISOR';
  await updated.save();
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(leader),
  });
  assert.equal(res.response.status, 403);

  // Removing advisor when none assigned
  updated.advisorId = null;
  updated.status = 'LOOKING_FOR_ADVISOR';
  await updated.save();
  res = await request(`/api/v1/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(admin),
  });
  assert.equal(res.response.status, 400);
  assert.equal(res.json.code, 'NO_ADVISOR_ASSIGNED');

  // Invalid groupId
  res = await request(`/api/v1/groups/invalid-group-id/advisor-assignment`, {
    method: 'DELETE',
    headers: await authHeaderFor(admin),
  });
  assert.equal(res.response.status, 404);
});

test('admin/coordinator can delete orphan group (no advisor)', async () => {
  const admin = await User.create({
    email: 'admin-orphan@example.com',
    fullName: 'Admin Orphan',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const coordinator = await User.create({
    email: 'coord-orphan@example.com',
    fullName: 'Coord Orphan',
    role: 'COORDINATOR',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Orphan Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: null,
  });

  const adminHeaders = await authHeaderFor(admin);
  const res1 = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  assert.equal(res1.response.status, 200);
  assert.equal(res1.json.code, 'SUCCESS');

  const coordHeaders = await authHeaderFor(coordinator);
  const res2 = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers: coordHeaders,
  });
  assert.equal(res2.response.status, 404);
});

test('cannot delete group with advisor', async () => {
  const admin = await User.create({
    email: 'admin-orphan2@example.com',
    fullName: 'Admin Orphan2',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Advisor Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: 'advisor-123',
  });
  const headers = await authHeaderFor(admin);
  const res = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 403);
  assert.equal(res.json.code, 'GROUP_HAS_ADVISOR');
});

test('cannot delete group with invalid or non-existent id', async () => {
  const admin = await User.create({
    email: 'admin-orphan3@example.com',
    fullName: 'Admin Orphan3',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const headers = await authHeaderFor(admin);
  const res1 = await request(`/api/v1/group-database/groups/not-a-uuid`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res1.response.status, 400);

  const uuid = '00000000-0000-0000-0000-000000000000';
  const res2 = await request(`/api/v1/group-database/groups/${uuid}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res2.response.status, 404);
});

test('student cannot delete orphan group via admin endpoint', async () => {
  const student = await User.create({
    email: 'student-orphan@example.com',
    fullName: 'Student Orphan',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070009999',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const group = await Group.create({
    name: 'Student Orphan Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: null,
  });
  const headers = await authHeaderFor(student);
  const res = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 403);
});

test('assigned advisor can release themselves from group', async () => {
  const advisor = await User.create({
    email: 'advisor-release@example.com',
    fullName: 'Advisor Release',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Release Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: advisor.id,
  });
  const headers = await authHeaderFor(advisor);
  const res = await request(`/api/v1/groups/${group.id}/advisor-release`, {
    method: 'PATCH',
    headers,
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');
  const updated = await Group.findByPk(group.id);
  assert.equal(updated.advisorId, null);
});

test('admin can remove advisor assignment from group', async () => {
  const admin = await User.create({
    email: 'admin-remove-advisor@example.com',
    fullName: 'Admin Remove Advisor',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const advisor = await User.create({
    email: 'advisor-remove@example.com',
    fullName: 'Advisor Remove',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });
  const group = await Group.create({
    name: 'Remove Advisor Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: advisor.id,
  });
  const headers = await authHeaderFor(admin);
  const res = await request(`/api/v1/group-database/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.groupId, group.id);
  assert.equal(res.json.removed, true);
  const updated = await Group.findByPk(group.id);
  assert.equal(updated.advisorId, null);
});

test('orphan group cleanup works after advisor removal', async () => {
  const admin = await User.create({
    email: 'admin-orphan-cleanup@example.com',
    fullName: 'Admin Orphan Cleanup',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const advisor = await User.create({
    email: 'advisor-orphan-cleanup@example.com',
    fullName: 'Advisor Orphan Cleanup',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });

  await Professor.create({
    userId: usedProfessorUser.id,
    department: 'Software Engineering',
  });

  const usedResult = await request('/api/v1/password-setup-token-store/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      setupToken: usedSetupToken,
    }),
  });

  assert.equal(usedResult.response.status, 200);
  assert.deepEqual(usedResult.json, {
    valid: false,
    message: 'Setup token is invalid, expired, or already used',
  });
});

test('internal professor record endpoint requires admin auth, persists record, and rejects duplicates', async () => {
  const unauthenticated = await request('/api/v1/user-database/professors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'internal-prof@example.edu',
      fullName: 'Internal Professor',
      department: 'Software Engineering',
    }),
  });

  assert.equal(unauthenticated.response.status, 401);

  const student = await User.create({
    email: 'student-auth@example.edu',
    fullName: 'Student Auth',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001000',
  });

  const forbidden = await request('/api/v1/user-database/professors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(student)),
    },
    body: JSON.stringify({
      email: 'internal-prof@example.edu',
      fullName: 'Internal Professor',
      department: 'Software Engineering',
    }),
  });

  assert.equal(forbidden.response.status, 403);

  const admin = await User.create({
    email: 'admin-internal@example.edu',
    fullName: 'Admin Internal',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(admin)),
  };

  const created = await request('/api/v1/user-database/professors', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: 'Internal-Prof@Example.edu',
      fullName: '  Internal Professor  ',
      department: '  Software Engineering  ',
    }),
  });

  assert.equal(created.response.status, 201);
  assert.deepEqual(created.json, {
    userId: created.json.userId,
    professorId: created.json.professorId,
    setupRequired: true,
  });

  const professorUser = await User.findByPk(created.json.userId);
  assert.equal(professorUser.email, 'internal-prof@example.edu');
  assert.equal(professorUser.fullName, 'Internal Professor');
  assert.equal(professorUser.role, 'PROFESSOR');
  assert.equal(professorUser.status, 'PASSWORD_SETUP_REQUIRED');
  assert.equal(professorUser.passwordSetupTokenHash, null);

  const professorRecord = await Professor.findByPk(created.json.professorId);
  assert.equal(professorRecord.userId, created.json.userId);
  assert.equal(professorRecord.department, 'Software Engineering');
  assert.equal(professorRecord.fullName, 'Internal Professor');

  const duplicate = await request('/api/v1/user-database/professors', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: 'internal-prof@example.edu',
      fullName: 'Other Professor',
      department: 'Computer Science',
    }),
  });

  assert.equal(duplicate.response.status, 409);
  assert.deepEqual(duplicate.json, {
    code: 'DUPLICATE_EMAIL',
    message: 'Email is already in use.',
  });
});

test('internal professor password update requires admin auth and activates the professor account', async () => {
  const professorUser = await User.create({
    email: 'patch-prof@example.edu',
    fullName: 'Patch Professor',
    role: 'PROFESSOR',
    status: 'PASSWORD_SETUP_REQUIRED',
    passwordSetupTokenHash: professorService.hashToken('pst_patch_token'),
    passwordSetupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const professor = await Professor.create({
    userId: professorUser.id,
    department: 'Software Engineering',
  });

  const passwordHash = await bcrypt.hash('StrongPass1!', 10);

  const unauthenticated = await request(`/api/v1/user-database/professors/${professor.id}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passwordHash }),
  });

  assert.equal(unauthenticated.response.status, 401);

  const student = await User.create({
    email: 'student-patch@example.edu',
    fullName: 'Student Patch',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001009',
  });

  const forbidden = await request(`/api/v1/user-database/professors/${professor.id}/password`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(student)),
    },
    body: JSON.stringify({ passwordHash }),
  });

  assert.equal(forbidden.response.status, 403);

  const admin = await User.create({
    email: 'admin-patch@example.edu',
    fullName: 'Admin Patch',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const success = await request(`/api/v1/user-database/professors/${professor.id}/password`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(admin)),
    },
    body: JSON.stringify({ passwordHash }),
  });

  assert.equal(success.response.status, 200);
  assert.deepEqual(success.json, {
    professorId: professor.id,
    message: 'Professor password updated successfully',
  });

  const updatedUser = await User.findByPk(professorUser.id);
  assert.equal(updatedUser.status, 'ACTIVE');
  assert.equal(updatedUser.password, passwordHash);
  assert.equal(updatedUser.passwordHash, passwordHash);
  assert.equal(updatedUser.passwordSetupTokenHash, null);
  assert.equal(updatedUser.passwordSetupTokenExpiresAt, null);

  const notFound = await request('/api/v1/user-database/professors/999999/password', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(admin)),
    },
    body: JSON.stringify({ passwordHash }),
  });

  assert.equal(notFound.response.status, 404);
  assert.deepEqual(notFound.json, {
    code: 'PROFESSOR_NOT_FOUND',
    message: 'Professor not found.',
  });
});

test('admin can bulk store valid student IDs and receives inserted, duplicate, and invalid counts', async () => {
  const admin = await User.create({
    email: 'valid-id-admin@example.edu',
    fullName: 'Valid ID Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const response = await request('/api/v1/user-database/valid-student-ids', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(admin)),
    },
    body: JSON.stringify({
      studentIds: [
        '22070001000',
        '22070001000',
        '22070001001',
        '11070001000',
        'invalid-id',
        '2207',
      ],
    }),
  });

  assert.equal(response.response.status, 201);
  assert.deepEqual(response.json, {
    insertedCount: 2,
    duplicateCount: 2,
    invalidFormatCount: 2,
    message: 'Valid student IDs processed successfully.',
  });

  const storedIds = await ValidStudentId.findAll({
    where: {
      studentId: ['22070001000', '22070001001'],
    },
  });

  assert.equal(storedIds.length, 2);
});

test('coordinator import endpoint requires coordinator role and stores valid student IDs', async () => {
  const coordinator = await User.create({
    email: 'coordinator@example.edu',
    fullName: 'Coordinator User',
    role: 'COORDINATOR',
    status: 'ACTIVE',
  });

  const coordinatorResponse = await request('/api/v1/coordinator/student-id-registry/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({
      studentIds: ['33070001000', 'bad-value'],
    }),
  });

  assert.equal(coordinatorResponse.response.status, 201);
  assert.deepEqual(coordinatorResponse.json, {
    insertedCount: 1,
    duplicateCount: 0,
    invalidFormatCount: 1,
    message: 'Valid student IDs processed successfully.',
  });

  const storedId = await ValidStudentId.findByPk('33070001000');
  assert.equal(storedId.studentId, '33070001000');

  const admin = await User.create({
    email: 'not-coordinator@example.edu',
    fullName: 'Not Coordinator',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const forbidden = await request('/api/v1/coordinator/student-id-registry/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(admin)),
    },
    body: JSON.stringify({
      studentIds: ['33070001001'],
    }),
  });

  assert.equal(forbidden.response.status, 403);
});

test('student registration validates eligibility, password strength, duplication, and success', async () => {
  const invalidStudentId = await request('/api/v1/students/registration-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001',
      email: 'invalid-id@example.edu',
      fullName: 'Invalid Id',
      password: 'StrongPass1!',
    }),
  });

  assert.equal(invalidStudentId.response.status, 400);
  assert.equal(invalidStudentId.json.code, 'INVALID_STUDENT_ID');

  const weakPassword = await request('/api/v1/students/registration-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001000',
      email: 'student1@example.edu',
      fullName: 'Ali Veli',
      password: 'weakpass',
    }),
  });

  assert.equal(weakPassword.response.status, 400);
  assert.equal(weakPassword.json.code, 'WEAK_PASSWORD');

  const ineligible = await request('/api/v1/students/registration-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001999',
      email: 'student2@example.edu',
      fullName: 'Ayse Veli',
      password: 'StrongPass1!',
    }),
  });

  assert.equal(ineligible.response.status, 403);
  assert.equal(ineligible.json.code, 'STUDENT_NOT_ELIGIBLE');

  const created = await request('/api/v1/students/registration-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001000',
      email: 'student3@example.edu',
      fullName: 'Mehmet Veli',
      password: 'StrongPass1!',
    }),
  });

  assert.equal(created.response.status, 200);
  assert.deepEqual(created.json, {
    valid: true,
    studentId: '11070001000',
    message: 'Validation passed',
  });

  await createStudent({
    studentId: '11070001000',
    email: 'student3@example.edu',
    fullName: 'Mehmet Veli',
    password: 'StrongPass1!',
  });

  const alreadyRegistered = await request('/api/v1/students/registration-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001000',
      email: 'student4@example.edu',
      fullName: 'Another User',
      password: 'StrongPass1!',
    }),
  });

  assert.equal(alreadyRegistered.response.status, 409);
  assert.equal(alreadyRegistered.json.code, 'ALREADY_REGISTERED');

  const duplicateEmail = await request('/api/v1/students/registration-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001001',
      email: 'student3@example.edu',
      fullName: 'Other User',
      password: 'StrongPass1!',
    }),
  });

  assert.equal(duplicateEmail.response.status, 409);
  assert.equal(duplicateEmail.json.code, 'DUPLICATE_EMAIL');

  const validation = await request('/api/v1/user-database/students/11070001000/validation');
  assert.deepEqual(validation.json, {
    valid: true,
    studentId: '11070001000',
    alreadyRegistered: true,
  });

  const createdStudent = await User.findOne({
    where: { studentId: '11070001000' },
  });

  assert.ok(createdStudent.passwordHash);
  assert.notEqual(createdStudent.passwordHash, 'StrongPass1!');
  assert.equal(await bcrypt.compare('StrongPass1!', createdStudent.passwordHash), true);
});

test('direct student account creation endpoint requires admin auth and persists provided password hashes securely', async () => {
  const admin = await User.create({
    email: 'student-admin@example.com',
    fullName: 'Student Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(admin)),
  };

  const unauthenticated = await request('/api/v1/user-database/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001001',
      email: 'dbcreate@example.edu',
      fullName: 'Database Student',
      passwordHash: '$2a$10$examplehashedpasswordvalue',
    }),
  });

  assert.equal(unauthenticated.response.status, 401);

  const passwordHash = await bcrypt.hash('StrongPass1!', 10);

  const created = await request('/api/v1/user-database/students', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId: '11070001001',
      email: 'dbcreate@example.edu',
      fullName: 'Database Student',
      passwordHash,
    }),
  });

  assert.equal(created.response.status, 201);
  assert.deepEqual(created.json, {
    userId: created.json.userId,
    studentId: '11070001001',
    message: 'Student account created successfully',
  });

  const storedStudent = await User.findByPk(created.json.userId);
  assert.equal(storedStudent.studentId, '11070001001');
  assert.equal(storedStudent.email, 'dbcreate@example.edu');
  assert.equal(storedStudent.passwordHash, passwordHash);
  assert.equal(storedStudent.password, null);

  const duplicateStudentId = await request('/api/v1/user-database/students', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId: '11070001001',
      email: 'other@example.edu',
      fullName: 'Other Student',
      passwordHash,
    }),
  });

  assert.equal(duplicateStudentId.response.status, 409);
  assert.equal(duplicateStudentId.json.code, 'ALREADY_REGISTERED');

  const duplicateEmail = await request('/api/v1/user-database/students', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId: '11070001002',
      email: 'dbcreate@example.edu',
      fullName: 'Other Student',
      passwordHash,
    }),
  });

  assert.equal(duplicateEmail.response.status, 409);
  assert.equal(duplicateEmail.json.code, 'DUPLICATE_EMAIL');

  const studentUser = await createStudent({
    studentId: '11070001000',
    email: 'regular-student@example.edu',
    fullName: 'Regular Student',
    password: 'StrongPass1!',
  });

  const forbidden = await request('/api/v1/user-database/students', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(studentUser)),
    },
    body: JSON.stringify({
      studentId: '11070001001',
      email: 'forbidden@example.edu',
      fullName: 'Forbidden Student',
      passwordHash,
    }),
  });

  assert.equal(forbidden.response.status, 403);
});

test('student register creates account after validation passes', async () => {
  const created = await request('/api/v1/students/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001002',
      email: 'student-register@example.edu',
      fullName: 'Register Student',
      password: 'StrongPass1!',
    }),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.json.valid, true);
  assert.equal(created.json.studentId, '11070001002');
  assert.equal(created.json.message, 'Student account created successfully');
  assert.equal(typeof created.json.userId, 'number');

  const duplicate = await request('/api/v1/students/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001002',
      email: 'student-register-2@example.edu',
      fullName: 'Register Student Again',
      password: 'StrongPass1!',
    }),
  });

  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.json.code, 'ALREADY_REGISTERED');
});

test('student registration service validates data before creating the account', async () => {
  await assert.rejects(
    studentRegistrationService.validateRegistrationDetails({
      studentId: '11070001',
      email: 'student6@example.edu',
      fullName: 'Invalid Format',
      password: 'StrongPass1!',
    }),
    (error) => {
      assert.ok(error instanceof StudentRegistrationError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'INVALID_STUDENT_ID');
      return true;
    },
  );

  await assert.rejects(
    studentRegistrationService.validateRegistrationDetails({
      studentId: '11070001999',
      email: 'student5@example.edu',
      fullName: 'Invalid Registry',
      password: 'StrongPass1!',
    }),
    (error) => {
      assert.ok(error instanceof StudentRegistrationError);
      assert.equal(error.status, 403);
      assert.equal(error.code, 'STUDENT_NOT_ELIGIBLE');
      return true;
    },
  );

  const validated = await studentRegistrationService.validateRegistrationDetails({
    studentId: '11070001002',
    email: 'CaseSensitive@Example.edu',
    fullName: '  Valid Student  ',
    password: 'StrongPass1!',
  });

  assert.deepEqual(validated, {
    studentId: '11070001002',
    email: 'casesensitive@example.edu',
    fullName: 'Valid Student',
    password: 'StrongPass1!',
  });

  const createdStudent = await studentRegistrationService.validateAndCreateStudent({
    studentId: '11070001002',
    email: 'CaseSensitive@Example.edu',
    fullName: '  Valid Student  ',
    password: 'StrongPass1!',
  });

  assert.equal(createdStudent.studentId, '11070001002');
  assert.equal(createdStudent.email, 'casesensitive@example.edu');

  await assert.rejects(
    studentRegistrationService.validateRegistrationDetails({
      studentId: '11070001001',
      email: 'CASESENSITIVE@example.edu',
      fullName: 'Duplicate Email',
      password: 'StrongPass1!',
    }),
    (error) => {
      assert.ok(error instanceof StudentRegistrationError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'DUPLICATE_EMAIL');
      return true;
    },
  );
});

test('github linking flow rejects unauthenticated requests and links account after callback', async () => {
  const registration = await request('/api/v1/students/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001000',
      email: 'student@example.edu',
      fullName: 'GitHub Student',
      password: 'StrongPass1!',
    }),
  });
  const student = await User.findByPk(registration.json.userId);

  const unauthenticated = await request('/api/v1/students/me/github/link');
  assert.equal(unauthenticated.response.status, 401);
  const authenticated = await request('/api/v1/students/me/github/link', {
    headers: await authHeaderFor(student),
  });

  assert.equal(authenticated.response.status, 200);
  assert.match(authenticated.json.authorizationUrl, /state=/);

  const state = new URL(authenticated.json.authorizationUrl, baseUrl).searchParams.get('state');

  const missingQuery = await request('/api/v1/auth/github/callback');
  assert.equal(missingQuery.response.status, 400);

  const invalidState = await request('/api/v1/auth/github/callback?code=test-code&state=bad-state');
  assert.equal(invalidState.response.status, 400);

  const callback = await request(`/api/v1/auth/github/callback?code=test-code&state=${state}`);
  assert.equal(callback.response.status, 200);
  assert.equal(callback.json.callbackVerified, true);
  assert.equal(callback.json.githubLinked, true);

  const linkedStudent = await User.findByPk(student.id);
  assert.equal(linkedStudent.githubLinked, true);
  assert.equal(linkedStudent.githubUsername, 'student-11070001000');

  const linkedAccount = await LinkedGitHubAccount.findOne({ where: { userId: student.id } });
  assert.equal(linkedAccount.githubUsername, 'student-11070001000');

  const duplicateLinkAttempt = await request(`/api/v1/auth/github/callback?code=test-code-2&state=${new URL((await request('/api/v1/students/me/github/link', {
    headers: await authHeaderFor(student),
  })).json.authorizationUrl, baseUrl).searchParams.get('state')}`);
  assert.equal(duplicateLinkAttempt.response.status, 409);
  assert.equal(
    duplicateLinkAttempt.json.code,
    'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT'
  );

  const reusedState = await request(`/api/v1/auth/github/callback?code=test-code&state=${state}`);
  assert.equal(reusedState.response.status, 400);
});

test('github callback redirects browser clients back to frontend with success state', async () => {
  const registration = await request('/api/v1/students/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001002',
      email: 'redirect@example.edu',
      fullName: 'Redirect Student',
      password: 'StrongPass1!',
    }),
  });
  const student = await User.findByPk(registration.json.userId);
  const authenticated = await request('/api/v1/students/me/github/link', {
    headers: await authHeaderFor(student),
  });
  const state = new URL(authenticated.json.authorizationUrl, baseUrl).searchParams.get('state');

  const response = await fetch(`${baseUrl}/api/v1/auth/github/callback?code=test-code&state=${state}`, {
    headers: {
      Accept: 'text/html',
    },
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /githubLink=success/);
  assert.match(response.headers.get('location'), /githubUsername=student-11070001002/);
});

test('manual linked account store and github patch endpoint update student status', async () => {
  await request('/api/v1/students/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001001',
      email: 'manual@example.edu',
      fullName: 'Manual Student',
      password: 'StrongPass1!',
    }),
  });

  const storeResult = await request('/api/v1/linked-github-account-store/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001001',
      githubId: '12345678',
      githubUsername: 'student-gh',
    }),
  });

  assert.equal(storeResult.response.status, 200);
  assert.equal(storeResult.json.linked, true);

  const relinkAttempt = await request('/api/v1/linked-github-account-store/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001001',
      githubId: '87654321',
      githubUsername: 'student-gh-second',
    }),
  });

  assert.equal(relinkAttempt.response.status, 409);
  assert.equal(relinkAttempt.json.code, 'GITHUB_RELINK_NOT_ALLOWED');

  const patchResult = await request('/api/v1/user-database/students/11070001001/github-link', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      githubUsername: 'student-gh-updated',
      githubLinked: true,
    }),
  });

  assert.equal(patchResult.response.status, 200);
  assert.deepEqual(patchResult.json, {
    studentId: '11070001001',
    githubLinked: true,
    message: 'Student GitHub link updated successfully',
  });
});

test('group database advisor transfer enforces role checks and updates the persisted assignment', async () => {
  const coordinator = await User.create({
    email: 'transfer-coordinator@example.edu',
    fullName: 'Transfer Coordinator',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const student = await createStudent({
    studentId: '11070001100',
    email: 'transfer-student@example.edu',
    fullName: 'Transfer Student',
    password: 'StrongPass1!',
  });
  const currentAdvisor = await createProfessorUser({
    email: 'current-advisor@example.edu',
    fullName: 'Current Advisor',
  });
  const targetAdvisor = await createProfessorUser({
    email: 'target-advisor@example.edu',
    fullName: 'Target Advisor',
  });

  const group = await Group.create({
    id: 'group-transfer-db-1',
    name: 'Transfer Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    advisorId: String(currentAdvisor.id),
  });

  const unauthenticated = await request(`/api/v1/group-database/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(unauthenticated.response.status, 401);

  const forbidden = await request(`/api/v1/group-database/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(student)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(forbidden.response.status, 403);

  const success = await request(`/api/v1/group-database/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(success.response.status, 200);
  assert.equal(success.json.groupId, group.id);
  assert.equal(success.json.advisorId, String(targetAdvisor.id));
  assert.equal(typeof success.json.updatedAt, 'string');

  const updatedGroup = await Group.findByPk(group.id);
  assert.equal(updatedGroup.advisorId, String(targetAdvisor.id));

  const sameAdvisor = await request(`/api/v1/group-database/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(sameAdvisor.response.status, 400);
  assert.equal(sameAdvisor.json.code, 'SAME_ADVISOR_TRANSFER');

  const missingGroup = await request('/api/v1/group-database/groups/missing-group/advisor-transfer', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(missingGroup.response.status, 404);
  assert.equal(missingGroup.json.code, 'GROUP_NOT_FOUND');

  const invalidAdvisor = await request(`/api/v1/group-database/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: 999999 }),
  });
  assert.equal(invalidAdvisor.response.status, 404);
  assert.equal(invalidAdvisor.json.code, 'ADVISOR_NOT_FOUND');

  const noAdvisorGroup = await Group.create({
    id: 'group-transfer-db-2',
    name: 'No Advisor Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    advisorId: null,
  });
  const noAdvisor = await request(`/api/v1/group-database/groups/${noAdvisorGroup.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(noAdvisor.response.status, 400);
  assert.equal(noAdvisor.json.code, 'GROUP_HAS_NO_ADVISOR');

  const staleAdvisorGroup = await Group.create({
    id: 'group-transfer-db-3',
    name: 'Stale Advisor Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    advisorId: '999999',
  });
  const staleAdvisor = await request(`/api/v1/group-database/groups/${staleAdvisorGroup.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(staleAdvisor.response.status, 400);
  assert.equal(staleAdvisor.json.code, 'GROUP_HAS_INVALID_ADVISOR');
});

test('user database advisor assignment sync validates membership and rewrites mirrored rows', async () => {
  const coordinator = await User.create({
    email: 'sync-coordinator@example.edu',
    fullName: 'Sync Coordinator',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const outsider = await User.create({
    email: 'outsider@example.edu',
    fullName: 'Outsider User',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const advisorA = await createProfessorUser({
    email: 'sync-advisor-a@example.edu',
    fullName: 'Sync Advisor A',
  });
  const advisorB = await createProfessorUser({
    email: 'sync-advisor-b@example.edu',
    fullName: 'Sync Advisor B',
  });
  const leader = await createStudent({
    studentId: '11070001101',
    email: 'sync-leader@example.edu',
    fullName: 'Sync Leader',
    password: 'StrongPass1!',
  });
  const member = await createStudent({
    studentId: '11070001102',
    email: 'sync-member@example.edu',
    fullName: 'Sync Member',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    id: 'group-sync-1',
    name: 'Sync Group',
    leaderId: String(leader.id),
    memberIds: [String(member.id)],
    advisorId: String(advisorA.id),
  });

  const unauthenticated = await request(`/api/v1/user-database/groups/${group.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ advisorId: advisorA.id }),
  });
  assert.equal(unauthenticated.response.status, 401);

  const forbidden = await request(`/api/v1/user-database/groups/${group.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ advisorId: advisorA.id }),
  });
  assert.equal(forbidden.response.status, 403);

  const success = await request(`/api/v1/user-database/groups/${group.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorId: advisorA.id }),
  });
  assert.equal(success.response.status, 200);
  assert.equal(success.json.groupId, group.id);
  assert.equal(success.json.advisorId, String(advisorA.id));
  assert.equal(success.json.updatedCount, 2);
  assert.equal(typeof success.json.updatedAt, 'string');

  const initialRows = await GroupAdvisorAssignment.findAll({
    where: { groupId: group.id },
    order: [['studentUserId', 'ASC']],
  });
  assert.deepEqual(
    initialRows.map((row) => [row.studentUserId, row.advisorUserId]),
    [
      [leader.id, advisorA.id],
      [member.id, advisorA.id],
    ],
  );

  const rewrite = await request(`/api/v1/user-database/groups/${group.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorId: advisorB.id }),
  });
  assert.equal(rewrite.response.status, 200);
  assert.equal(rewrite.json.advisorId, String(advisorB.id));
  assert.equal(rewrite.json.updatedCount, 2);

  const rewrittenRows = await GroupAdvisorAssignment.findAll({
    where: { groupId: group.id },
    order: [['studentUserId', 'ASC']],
  });
  assert.deepEqual(
    rewrittenRows.map((row) => [row.studentUserId, row.advisorUserId]),
    [
      [leader.id, advisorB.id],
      [member.id, advisorB.id],
    ],
  );

  const missingGroup = await request('/api/v1/user-database/groups/missing-group/advisor-assignment', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorId: advisorA.id }),
  });
  assert.equal(missingGroup.response.status, 404);
  assert.equal(missingGroup.json.code, 'GROUP_NOT_FOUND');

  const invalidAdvisor = await request(`/api/v1/user-database/groups/${group.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorId: 999999 }),
  });
  assert.equal(invalidAdvisor.response.status, 404);
  assert.equal(invalidAdvisor.json.code, 'ADVISOR_NOT_FOUND');

  const noMembersGroup = await Group.create({
    id: 'group-sync-2',
    name: 'No Members Group',
    leaderId: null,
    memberIds: [],
    advisorId: String(advisorA.id),
  });
  const noMembers = await request(`/api/v1/user-database/groups/${noMembersGroup.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorId: advisorA.id }),
  });
  assert.equal(noMembers.response.status, 400);
  assert.equal(noMembers.json.code, 'GROUP_HAS_NO_MEMBERS');

  const unresolvedMemberGroup = await Group.create({
    id: 'group-sync-3',
    name: 'Unresolved Member Group',
    leaderId: String(leader.id),
    memberIds: ['999999'],
    advisorId: String(advisorA.id),
  });
  const unresolvedMember = await request(`/api/v1/user-database/groups/${unresolvedMemberGroup.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorId: advisorA.id }),
  });
  assert.equal(unresolvedMember.response.status, 400);
  assert.equal(unresolvedMember.json.code, 'GROUP_MEMBER_RESOLUTION_FAILED');

  const nonStudentMemberGroup = await Group.create({
    id: 'group-sync-4',
    name: 'Non Student Member Group',
    leaderId: String(leader.id),
    memberIds: [String(outsider.id)],
    advisorId: String(advisorA.id),
  });
  const nonStudentMember = await request(`/api/v1/user-database/groups/${nonStudentMemberGroup.id}/advisor-assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorId: advisorA.id }),
  });
  assert.equal(nonStudentMember.response.status, 400);
  assert.equal(nonStudentMember.json.code, 'GROUP_MEMBER_RESOLUTION_FAILED');
});

test('coordinator advisor transfer updates group assignment and mirrored rows atomically', async () => {
  const coordinator = await User.create({
    email: 'coordinator-transfer@example.edu',
    fullName: 'Coordinator Transfer',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const student = await createStudent({
    studentId: '11070001103',
    email: 'coordinator-transfer-student@example.edu',
    fullName: 'Coordinator Transfer Student',
    password: 'StrongPass1!',
  });
  const currentAdvisor = await createProfessorUser({
    email: 'coordinator-current-advisor@example.edu',
    fullName: 'Coordinator Current Advisor',
  });
  const targetAdvisor = await createProfessorUser({
    email: 'coordinator-target-advisor@example.edu',
    fullName: 'Coordinator Target Advisor',
  });

  const group = await Group.create({
    id: 'group-coordinator-transfer-1',
    name: 'Coordinator Transfer Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    advisorId: String(currentAdvisor.id),
  });

  const unauthenticated = await request(`/api/v1/coordinator/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(unauthenticated.response.status, 401);

  const forbidden = await request(`/api/v1/coordinator/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(student)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(forbidden.response.status, 403);

  const success = await request(`/api/v1/coordinator/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(success.response.status, 200);
  assert.equal(success.json.groupId, group.id);
  assert.equal(success.json.advisorId, String(targetAdvisor.id));
  assert.equal(success.json.updatedCount, 1);
  assert.equal(typeof success.json.updatedAt, 'string');

  const updatedGroup = await Group.findByPk(group.id);
  assert.equal(updatedGroup.advisorId, String(targetAdvisor.id));

  const mirroredRows = await GroupAdvisorAssignment.findAll({ where: { groupId: group.id } });
  assert.equal(mirroredRows.length, 1);
  assert.equal(mirroredRows[0].studentUserId, student.id);
  assert.equal(mirroredRows[0].advisorUserId, targetAdvisor.id);

  const sameAdvisor = await request(`/api/v1/coordinator/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(sameAdvisor.response.status, 400);
  assert.equal(sameAdvisor.json.code, 'SAME_ADVISOR_TRANSFER');

  const missingGroup = await request('/api/v1/coordinator/groups/missing-group/advisor-transfer', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(missingGroup.response.status, 404);
  assert.equal(missingGroup.json.code, 'GROUP_NOT_FOUND');

  const invalidAdvisor = await request(`/api/v1/coordinator/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: 999999 }),
  });
  assert.equal(invalidAdvisor.response.status, 404);
  assert.equal(invalidAdvisor.json.code, 'ADVISOR_NOT_FOUND');

  const noAdvisorGroup = await Group.create({
    id: 'group-coordinator-transfer-2',
    name: 'Coordinator No Advisor Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    advisorId: null,
  });
  const noAdvisor = await request(`/api/v1/coordinator/groups/${noAdvisorGroup.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(noAdvisor.response.status, 400);
  assert.equal(noAdvisor.json.code, 'GROUP_HAS_NO_ADVISOR');

  const staleAdvisorGroup = await Group.create({
    id: 'group-coordinator-transfer-3',
    name: 'Coordinator Stale Advisor Group',
    leaderId: String(student.id),
    memberIds: [String(student.id)],
    advisorId: '999999',
  });
  const staleAdvisor = await request(`/api/v1/coordinator/groups/${staleAdvisorGroup.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ newAdvisorId: targetAdvisor.id }),
  });
  assert.equal(staleAdvisor.response.status, 400);
  assert.equal(staleAdvisor.json.code, 'GROUP_HAS_INVALID_ADVISOR');
});

// ============================================
// NOTIFICATION TESTS (Issue 12)
// ============================================

test('[NOTIFICATIONS] backend emits notification after successful finalize only', async () => {
  const leader = await User.create({
    email: 'notif-leader@example.com',
    fullName: 'Notification Leader',
    role: 'STUDENT',
    status: 'ACTIVE',
  });

  const leaderHeaders = await authHeaderFor(leader);

  // Create group with leader
  const groupResult = await request('/api/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...leaderHeaders },
    body: JSON.stringify({
      groupName: 'Notification Test Group',
      maxMembers: 2,
    }),
  });

  const groupId = groupResult.json.data.groupId;

  // Capture console output BEFORE making requests
  const originalLog = console.log;
  const capturedLogs = [];
  console.log = (...args) => {
    capturedLogs.push(args.join(' '));
    originalLog(...args);
  };

  // Successful finalize - SHOULD emit notification
  const successResult = await request(`/api/v1/groups/${groupId}/membership/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...leaderHeaders },
    body: JSON.stringify({ studentId: '11070010000' }),
  });

  assert.equal(successResult.response.status, 200);

  // Give time for async notification to be logged
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Verify notification was emitted (check logs contain NotificationService event)
  const notificationLogged = capturedLogs.some((log) => log.includes('[NotificationService] Event emitted'));
  assert.equal(notificationLogged, true, 'Notification should be emitted on successful finalize');

  // Reset logs
  capturedLogs.length = 0;

  // Failed finalize (duplicate member) - should NOT emit notification
  const failureResult = await request(`/api/v1/groups/${groupId}/membership/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...leaderHeaders },
    body: JSON.stringify({ studentId: '11070010000' }), // Same student, should fail
  });

  assert.equal(failureResult.response.status, 400);
  assert.equal(failureResult.json.code, 'DUPLICATE_MEMBER');

  // Give time in case error still triggers notification
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Verify notification was NOT emitted for failed request
  const failureNotificationLogged = capturedLogs.some((log) =>
    log.includes('[NotificationService] Event emitted')
  );
  assert.equal(failureNotificationLogged, false, 'Notification should NOT be emitted on failed finalize');

  // Restore console.log
  console.log = originalLog;
});

test('[E2E NOTIFICATIONS] leader receives notification after invitee accepts', async () => {
  const leader = await User.create({
    email: 'e2e-notif-leader@example.com',
    fullName: 'E2E Notification Leader',
    role: 'STUDENT',
    status: 'ACTIVE',
  });

  const leaderHeaders = await authHeaderFor(leader);

  // Create group with explicit leader
  const groupResult = await request('/api/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...leaderHeaders },
    body: JSON.stringify({
      groupName: 'E2E Notification Test',
      maxMembers: 3,
    }),
  });

  const groupId = groupResult.json.data.groupId;

  // Capture logs for notification verification
  const originalLog = console.log;
  const allNotifications = [];
  console.log = (...args) => {
    const logEntry = args.join(' ');
    allNotifications.push(logEntry);
    originalLog(...args);
  };

  // Invitee 1 accepts (first member)
  await request(`/api/v1/groups/${groupId}/membership/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...leaderHeaders },
    body: JSON.stringify({ studentId: '11070020000' }),
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  // Invitee 2 accepts (second member)
  await request(`/api/v1/groups/${groupId}/membership/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...leaderHeaders },
    body: JSON.stringify({ studentId: '11070020001' }),
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  // Verify leader received 2 notifications by checking all logs
  const emittedEventLines = allNotifications.filter((log) =>
    log.includes('[NotificationService] Event emitted')
  );
  
  const group = await Group.create({
    name: 'Cleanup Group',
    maxMembers: 4,
    leaderId: null,
    memberIds: [],
    advisorId: advisor.id,
  });
  
  const headers = await authHeaderFor(admin);
  await request(`/api/v1/group-database/groups/${group.id}/advisor-assignment`, {
    method: 'DELETE',
    headers,
  });
  
  const res = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.json.code, 'SUCCESS');
  
  const deleted = await Group.findByPk(group.id);
  assert.equal(deleted, null);
});

test('advisor notification endpoints filter by authenticated advisor and support mark-as-read', async () => {
  const advisorA = await User.create({
    email: 'advisor-a@example.com',
    fullName: 'Advisor A',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });
  const advisorB = await User.create({
    email: 'advisor-b@example.com',
    fullName: 'Advisor B',
    role: 'PROFESSOR',
    status: 'ACTIVE',
  });

  await Notification.bulkCreate([
    {
      userId: advisorA.id,
      type: 'ADVISOR_REQUEST',
      payload: JSON.stringify({
        requestId: 'req-a',
        groupId: 'group-a',
        groupName: 'Group A',
        status: 'PENDING',
      }),
      status: 'SENT',
    },
    {
      userId: advisorB.id,
      type: 'ADVISOR_REQUEST',
      payload: JSON.stringify({
        requestId: 'req-b',
        groupId: 'group-b',
        groupName: 'Group B',
        status: 'PENDING',
      }),
      status: 'SENT',
    },
    {
      userId: advisorA.id,
      type: 'GROUP_TRANSFER',
      payload: JSON.stringify({
        groupId: 'group-transfer-a',
        groupName: 'Transfer A',
        message: 'Transferred to you',
      }),
      status: 'SENT',
    },
  ]);

  const headersA = await authHeaderFor(advisorA);

  const adviseeResponse = await request('/api/v1/advisors/notifications/advisee-requests', {
    headers: headersA,
  });
  assert.equal(adviseeResponse.response.status, 200);
  assert.equal(adviseeResponse.json.count, 1);
  assert.equal(adviseeResponse.json.data[0].groupName, 'Group A');
  assert.equal(adviseeResponse.json.data[0].isRead, false);

  const transferResponse = await request('/api/v1/advisors/notifications/group-transfers', {
    headers: headersA,
  });
  assert.equal(transferResponse.response.status, 200);
  assert.equal(transferResponse.json.count, 1);
  assert.equal(transferResponse.json.data[0].groupName, 'Transfer A');

  const notificationId = adviseeResponse.json.data[0].id;
  const markReadResponse = await request(`/api/v1/advisors/notifications/advisee-request/${notificationId}/read`, {
    method: 'PUT',
    headers: headersA,
  });
  assert.equal(markReadResponse.response.status, 200);
  assert.equal(markReadResponse.json.notification.isRead, true);

  const updatedNotification = await Notification.findByPk(notificationId);
  assert.equal(updatedNotification.status, 'READ');

  const forbiddenRead = await request(`/api/v1/advisors/notifications/advisee-request/${notificationId}/read`, {
    method: 'PUT',
    headers: await authHeaderFor(advisorB),
  });
  assert.equal(forbiddenRead.response.status, 404);
});

test('team leader can view their advisor request details but others cannot', async () => {
  const leader = await User.create({
    email: 'leader-details@example.com',
    fullName: 'Leader Details',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070008888',
    password: 'irrelevant',
  });
  const outsider = await User.create({
    email: 'outsider-details@example.com',
    fullName: 'Outsider Details',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070007777',
    password: 'irrelevant',
  });
  const advisorUser = await User.create({
    email: 'advisor-details@example.com',
    fullName: 'Advisor Details',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: 'irrelevant',
  });
  const professor = await Professor.create({
    userId: advisorUser.id,
    department: 'Computer Engineering',
  });
  const group = await Group.create({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Detail Group',
    leaderId: leader.id,
    memberIds: [leader.id],
    maxMembers: 4,
    status: 'FORMATION',
  });
  const advisorRequest = await AdvisorRequest.create({
    id: '22222222-2222-2222-2222-222222222222',
    groupId: group.id,
    advisorId: advisorUser.id,
    teamLeaderId: leader.id,
    status: 'PENDING',
  });

  const okResponse = await request(`/api/v1/advisor-requests/${advisorRequest.id}`, {
    headers: await authHeaderFor(leader),
  });
  assert.equal(okResponse.response.status, 200);
  assert.equal(okResponse.json.id, advisorRequest.id);
  assert.equal(okResponse.json.group.id, group.id);
  assert.equal(okResponse.json.group.teamLeader.id, leader.id);
  assert.equal(okResponse.json.professor.id, professor.id);
  assert.equal(okResponse.json.professor.user.id, advisorUser.id);

  const forbiddenResponse = await request(`/api/v1/advisor-requests/${advisorRequest.id}`, {
    headers: await authHeaderFor(outsider),
  });
  assert.equal(forbiddenResponse.response.status, 403);
});
