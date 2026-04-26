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
  Invitation,
  AuditLog,
  Notification,
  ValidStudentId,
  LinkedGitHubAccount,
  OAuthState,
  DeliverableSubmission,
  RubricCriterion,
  CommitteeReview,
} = require('../models');
const StudentRegistrationError = require('../errors/studentRegistrationError');
const studentRegistrationService = require('../services/studentRegistrationService');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');
const professorService = require('../services/professorService');

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
  await CommitteeReview.destroy({ where: {} });
  await DeliverableSubmission.destroy({ where: {} });
  await RubricCriterion.destroy({ where: {} });
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

test('admin can log in with email and password', async () => {
  const password = 'AdminPass2026!';

  await User.create({
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const successResult = await request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password,
    }),
  });

  assert.equal(successResult.response.status, 200);
  assert.equal(typeof successResult.json.token, 'string');
  assert.equal(successResult.json.user.role, 'ADMIN');

  const invalidResult = await request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'WrongPass1!',
    }),
  });

  assert.equal(invalidResult.response.status, 401);
  assert.equal(invalidResult.json.code, 'INVALID_CREDENTIALS');
});

test('audit log feed is admin-only', async () => {
  const admin = await User.create({
    email: 'audit-admin@example.com',
    fullName: 'Audit Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const student = await createStudent({
    studentId: '11070001011',
    email: 'audit-student@example.edu',
    fullName: 'Audit Student',
    password: 'StrongPass1!',
  });

  await AuditLog.create({
    action: 'GROUP_CREATED',
    actorId: admin.id,
    targetType: 'GROUP',
    targetId: 'group-audit-1',
    metadata: { groupName: 'Audit Group' },
  });

  const forbidden = await request('/api/v1/admin/audit-logs', {
    headers: await authHeaderFor(student),
  });
  assert.equal(forbidden.response.status, 403);

  const success = await request('/api/v1/admin/audit-logs', {
    headers: await authHeaderFor(admin),
  });
  assert.equal(success.response.status, 200);
  assert.equal(success.json.count, 1);
  assert.equal(success.json.data[0].action, 'GROUP_CREATED');
  assert.equal(success.json.data[0].actor.email, 'audit-admin@example.com');
});

test('coordinator can log in with email and password', async () => {
  const password = 'CoordinatorPass2026!';

  await User.create({
    email: 'coordinator-login@example.com',
    fullName: 'Coordinator Login',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const successResult = await request('/api/v1/coordinator/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'coordinator-login@example.com',
      password,
    }),
  });

  assert.equal(successResult.response.status, 200);
  assert.equal(typeof successResult.json.token, 'string');
  assert.equal(successResult.json.user.role, 'COORDINATOR');

  const invalidResult = await request('/api/v1/coordinator/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'coordinator-login@example.com',
      password: 'WrongPass1!',
    }),
  });

  assert.equal(invalidResult.response.status, 401);
  assert.equal(invalidResult.json.code, 'INVALID_CREDENTIALS');
});

test('student can log in with student ID and password only when the student ID is eligible', async () => {
  const password = 'StrongPass1!';

  await createStudent({
    studentId: '11070001000',
    email: 'student-login@example.edu',
    fullName: 'Student Login',
    password,
  });

  const successResult = await request('/api/v1/students/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001000',
      password,
    }),
  });

  assert.equal(successResult.response.status, 200);
  assert.equal(typeof successResult.json.token, 'string');
  assert.equal(successResult.json.user.role, 'STUDENT');
  assert.equal(successResult.json.user.studentId, '11070001000');

  const wrongPassword = await request('/api/v1/students/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001000',
      password: 'WrongPass1!',
    }),
  });

  assert.equal(wrongPassword.response.status, 401);
  assert.equal(wrongPassword.json.code, 'INVALID_CREDENTIALS');

  await User.create({
    email: 'ineligible-login@example.edu',
    fullName: 'Ineligible Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001999',
    passwordHash: await bcrypt.hash(password, 10),
  });

  const ineligibleResult = await request('/api/v1/students/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001999',
      password,
    }),
  });

  assert.equal(ineligibleResult.response.status, 403);
  assert.equal(ineligibleResult.json.code, 'STUDENT_NOT_ELIGIBLE');
});

test('students/me enforces auth and returns current student profile including github fields', async () => {
  const password = 'StrongPass1!';
  const student = await createStudent({
    studentId: '11070001000',
    email: 'student-me@example.edu',
    fullName: 'Student Me',
    password,
  });

  student.githubLinked = true;
  student.githubUsername = 'student-me-gh';
  await student.save();

  const unauthenticated = await request('/api/v1/students/me');
  assert.equal(unauthenticated.response.status, 401);

  const authenticated = await request('/api/v1/students/me', {
    headers: await authHeaderFor(student),
  });

  assert.equal(authenticated.response.status, 200);
  assert.deepEqual(authenticated.json, {
    user: {
      id: student.id,
      studentId: '11070001000',
      fullName: 'Student Me',
      email: 'student-me@example.edu',
      role: 'STUDENT',
      githubLinked: true,
      githubUsername: 'student-me-gh',
    },
  });

  const professor = await User.create({
    email: 'students-me-prof@example.edu',
    fullName: 'Professor Me',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const forbidden = await request('/api/v1/students/me', {
    headers: await authHeaderFor(professor),
  });

  assert.equal(forbidden.response.status, 403);
  assert.deepEqual(forbidden.json, {
    code: 'STUDENT_AUTH_REQUIRED',
    message: 'Active authenticated student account required.',
  });
});

test('professor can log in with email and chosen password after setup', async () => {
  const password = 'StrongPass1!';

  await User.create({
    email: 'prof-login@example.edu',
    fullName: 'Professor Login',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash(password, 10),
  });

  const successResult = await request('/api/v1/professors/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'prof-login@example.edu',
      password,
    }),
  });

  assert.equal(successResult.response.status, 200);
  assert.equal(typeof successResult.json.token, 'string');
  assert.equal(successResult.json.user.role, 'PROFESSOR');
});

test('advisor notifications endpoint returns only advisee requests for the authenticated professor', async () => {
  const professor = await User.create({
    email: 'advisor@example.edu',
    fullName: 'Advisor Inbox',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const otherProfessor = await User.create({
    email: 'other-advisor@example.edu',
    fullName: 'Other Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  await Notification.create({
    userId: professor.id,
    type: 'ADVISEE_REQUEST',
    payload: JSON.stringify({
      requestId: 'req-1',
      groupId: 'group-1',
      groupName: 'Team Atlas',
      requestStatus: 'PENDING',
      message: 'Team Atlas requested you as advisor.',
    }),
    status: 'SENT',
  });

  await Notification.create({
    userId: professor.id,
    type: 'GROUP_INVITE',
    payload: JSON.stringify({
      groupId: 'group-ignore',
    }),
    status: 'SENT',
  });

  await Notification.create({
    userId: otherProfessor.id,
    type: 'ADVISEE_REQUEST',
    payload: JSON.stringify({
      requestId: 'req-2',
      groupId: 'group-2',
      groupName: 'Team Nova',
      requestStatus: 'PENDING',
      message: 'Team Nova requested you as advisor.',
    }),
    status: 'SENT',
  });

  const result = await request('/api/v1/advisors/notifications/advisee-requests', {
    headers: await authHeaderFor(professor),
  });

  assert.equal(result.response.status, 200);
  assert.equal(Array.isArray(result.json), true);
  assert.equal(result.json.length, 1);
  assert.equal(result.json[0].type, 'ADVISEE_REQUEST');
  assert.equal(result.json[0].requestId, 'req-1');
  assert.equal(result.json[0].groupName, 'Team Atlas');
  assert.equal(result.json[0].requestStatus, 'PENDING');
});

test('advisor notifications endpoint enriches notifications with advisor request status details', async () => {
  const professor = await User.create({
    email: 'advisor-enriched@example.edu',
    fullName: 'Advisor Enriched',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  await AdvisorRequest.create({
    id: 'req-enriched-1',
    groupId: 'group-enriched-1',
    advisorId: professor.id,
    teamLeaderId: 'leader-enriched-1',
    status: 'APPROVED',
    note: 'Approved with updated availability.',
    decidedAt: new Date('2026-04-20T10:00:00.000Z'),
  });

  await Notification.create({
    userId: professor.id,
    type: 'ADVISEE_REQUEST',
    payload: JSON.stringify({
      requestId: 'req-enriched-1',
      groupId: 'group-enriched-1',
      groupName: 'Team Enriched',
      requestStatus: 'PENDING',
      message: 'Team Enriched requested you as advisor.',
    }),
    status: 'SENT',
  });

  const result = await request('/api/v1/advisors/notifications/advisee-requests', {
    headers: await authHeaderFor(professor),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.length, 1);
  assert.equal(result.json[0].requestId, 'req-enriched-1');
  assert.equal(result.json[0].requestStatus, 'APPROVED');
  assert.equal(result.json[0].note, 'Approved with updated availability.');
  assert.equal(result.json[0].decidedAt, '2026-04-20T10:00:00.000Z');
  assert.equal(result.json[0].status, 'SENT');
});

test('assigned advisor can approve a pending advisor request', async () => {
  const professor = await User.create({
    email: 'approve-advisor@example.edu',
    fullName: 'Approve Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const leader = await User.create({
    email: 'leader@example.edu',
    fullName: 'Team Leader',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001235',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const group = await Group.create({
    id: 'group-approve-1',
    name: 'Team Atlas',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
  });

  await AdvisorRequest.create({
    id: 'advisor-request-1',
    groupId: group.id,
    advisorId: professor.id,
    teamLeaderId: leader.id,
    status: 'PENDING',
  });

  const result = await request('/api/v1/advisor-requests/advisor-request-1/decision', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({
      decision: 'APPROVE',
      note: 'I can supervise this team.',
    }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.status, 'APPROVED');
  assert.equal(result.json.note, 'I can supervise this team.');
  assert.equal(result.json.message, 'Advisor request approved successfully.');

  const updatedRequest = await AdvisorRequest.findByPk('advisor-request-1');
  const updatedGroup = await Group.findByPk(group.id);
  assert.equal(updatedRequest.status, 'APPROVED');
  assert.equal(updatedGroup.advisorId, String(professor.id));
});

test('assigned advisor can reject a pending advisor request without changing group advisor assignment', async () => {
  const professor = await User.create({
    email: 'reject-advisor@example.edu',
    fullName: 'Reject Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const leader = await User.create({
    email: 'reject-leader@example.edu',
    fullName: 'Reject Leader',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001236',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const group = await Group.create({
    id: 'group-reject-1',
    name: 'Team Borealis',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    advisorId: null,
  });

  await AdvisorRequest.create({
    id: 'advisor-request-reject-1',
    groupId: group.id,
    advisorId: professor.id,
    teamLeaderId: leader.id,
    status: 'PENDING',
  });

  const result = await request('/api/v1/advisor-requests/advisor-request-reject-1/decision', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({
      decision: 'REJECT',
      note: 'I do not have capacity this semester.',
    }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.status, 'REJECTED');
  assert.equal(result.json.note, 'I do not have capacity this semester.');
  assert.equal(result.json.message, 'Advisor request rejected successfully.');

  const updatedRequest = await AdvisorRequest.findByPk('advisor-request-reject-1');
  const updatedGroup = await Group.findByPk(group.id);
  const auditLog = await AuditLog.findOne({
    where: {
      targetId: 'advisor-request-reject-1',
      action: 'ADVISOR_REQUEST_REJECTED',
    },
  });

  assert.equal(updatedRequest.status, 'REJECTED');
  assert.equal(updatedGroup.advisorId, null);
  assert.ok(auditLog);
  assert.equal(auditLog.actorId, professor.id);
});

test('advisor request decision rejects invalid decision values', async () => {
  const professor = await User.create({
    email: 'invalid-decision-advisor@example.edu',
    fullName: 'Invalid Decision Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const result = await request('/api/v1/advisor-requests/invalid-decision-request/decision', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({
      decision: 'MAYBE',
    }),
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.json.code, 'INVALID_DECISION');
  assert.equal(result.json.message, 'Decision must be APPROVE or REJECT.');
});

test('advisor request decision returns not found when the request does not exist', async () => {
  const professor = await User.create({
    email: 'missing-request-advisor@example.edu',
    fullName: 'Missing Request Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const result = await request('/api/v1/advisor-requests/non-existent-request/decision', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({
      decision: 'APPROVE',
    }),
  });

  assert.equal(result.response.status, 404);
  assert.equal(result.json.code, 'REQUEST_NOT_FOUND');
  assert.equal(result.json.message, 'Advisor request not found.');
});

test('advisor request cannot be decided twice', async () => {
  const professor = await User.create({
    email: 'resolved-advisor@example.edu',
    fullName: 'Resolved Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  await AdvisorRequest.create({
    id: 'advisor-request-2',
    groupId: 'group-resolved-1',
    advisorId: professor.id,
    status: 'APPROVED',
  });

  const result = await request('/api/v1/advisor-requests/advisor-request-2/decision', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({
      decision: 'REJECT',
    }),
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.json.code, 'REQUEST_ALREADY_RESOLVED');
  assert.equal(result.json.message, 'Advisor request has already been decided.');
});

test('only the assigned advisor can decide an advisor request', async () => {
  const professor = await User.create({
    email: 'owner-advisor@example.edu',
    fullName: 'Owner Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const otherProfessor = await User.create({
    email: 'other-owner-advisor@example.edu',
    fullName: 'Other Owner Advisor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  await AdvisorRequest.create({
    id: 'advisor-request-3',
    groupId: 'group-owner-1',
    advisorId: professor.id,
    status: 'PENDING',
  });

  const result = await request('/api/v1/advisor-requests/advisor-request-3/decision', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(otherProfessor)),
    },
    body: JSON.stringify({
      decision: 'APPROVE',
    }),
  });

  assert.equal(result.response.status, 403);
  assert.equal(result.json.code, 'FORBIDDEN');
});

test('advisor notifications endpoint rejects non-professor users', async () => {
  const student = await User.create({
    email: 'student-not-allowed@example.edu',
    fullName: 'Student Viewer',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001234',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const result = await request('/api/v1/advisors/notifications/advisee-requests', {
    headers: await authHeaderFor(student),
  });

  assert.equal(result.response.status, 403);
  assert.equal(result.json.message, 'Forbidden');
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

test('coordinator can add a student to a group and the membership audit log is written', async () => {
  const coordinator = await User.create({
    email: 'membership-coordinator@example.edu',
    fullName: 'Membership Coordinator',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const leader = await createStudent({
    studentId: '11070001110',
    email: 'membership-leader@example.edu',
    fullName: 'Membership Leader',
    password: 'StrongPass1!',
  });
  const member = await createStudent({
    studentId: '11070001002',
    email: 'membership-target@example.edu',
    fullName: 'Membership Target',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    id: 'group-membership-coordinator-1',
    name: 'baba',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
    status: 'FORMATION',
  });

  const response = await request(`/api/v1/coordinator/groups/${group.id}/members`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({
      action: 'ADD',
      studentId: '11070001002',
    }),
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.json.id, group.id);
  assert.ok(response.json.memberIds.includes(String(member.id)));

  const updatedGroup = await Group.findByPk(group.id);
  assert.ok(updatedGroup.memberIds.includes(String(member.id)));

  const auditLog = await AuditLog.findOne({
    where: {
      action: 'COORDINATOR_MEMBER_ADDED',
      actorId: coordinator.id,
      targetType: 'GROUP',
      targetId: group.id,
    },
  });
  assert.ok(auditLog);
  assert.equal(auditLog.metadata.studentId, '11070001002');
  assert.equal(auditLog.metadata.membershipAction, 'ADD');
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
  try {
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

    assert.equal(emittedEventLines.length, 2);
    assert.ok(
      emittedEventLines.every((line) => line.includes('GROUP_MEMBERSHIP_ACCEPTED')),
      'Expected membership acceptance notifications to be emitted for the leader',
    );
  } finally {
    console.log = originalLog;
  }
});

test('finalize membership counts the leader toward maxMembers', async () => {
  const leader = await createStudent({
    studentId: '11070030000',
    email: 'finalize-capacity-leader@example.edu',
    fullName: 'Finalize Capacity Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070030001',
    email: 'finalize-capacity-invitee@example.edu',
    fullName: 'Finalize Capacity Invitee',
    password: 'StrongPass1!',
  });

  const groupResult = await request('/api/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(leader)) },
    body: JSON.stringify({
      groupName: 'Finalize Capacity Group',
      maxMembers: 1,
    }),
  });

  assert.equal(groupResult.response.status, 201);

  const finalizeResponse = await request(`/api/v1/groups/${groupResult.json.data.groupId}/membership/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: invitee.studentId }),
  });

  assert.equal(finalizeResponse.response.status, 400);
  assert.equal(finalizeResponse.json.code, 'MAX_MEMBERS_REACHED');
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

test('legacy invitation response route writes a compatible audit log entry', async () => {
  const leader = await createStudent({
    studentId: '11070001141',
    email: 'legacy-invite-leader@example.edu',
    fullName: 'Legacy Invite Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001142',
    email: 'legacy-invite-student@example.edu',
    fullName: 'Legacy Invite Student',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    name: 'Legacy Invitation Group',
    leaderId: leader.id,
    memberIds: [String(leader.id)],
    advisorId: null,
    status: 'FORMATION',
    maxMembers: 4,
  });

  const invitation = await Invitation.create({
    id: '44444444-4444-4444-4444-444444444444',
    groupId: group.id,
    inviteeId: invitee.id,
    status: 'PENDING',
  });

  const response = await request(`/api/v1/invitations/${invitation.id}/response`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(invitee)),
    },
    body: JSON.stringify({ response: 'REJECT' }),
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.json.invitation.status, 'REJECTED');

  await new Promise((resolve) => setTimeout(resolve, 50));

  const auditLog = await AuditLog.findOne({
    where: {
      action: 'INVITATION_REJECTED',
      targetType: 'INVITATION',
      targetId: invitation.id,
      actorId: invitee.id,
    },
  });

  assert.ok(auditLog);
  assert.equal(auditLog.metadata.groupId, group.id);
});

test('team leader cannot submit an advisor request for a group that already has an advisor', async () => {
  const leader = await createStudent({
    studentId: '11070001121',
    email: 'leader-has-advisor@example.edu',
    fullName: 'Leader Has Advisor',
    password: 'StrongPass1!',
  });
  const currentAdvisor = await createProfessorUser({
    email: 'current-advisor-has-group@example.edu',
    fullName: 'Current Advisor Has Group',
  });
  const requestedAdvisor = await createProfessorUser({
    email: 'requested-advisor-has-group@example.edu',
    fullName: 'Requested Advisor Has Group',
  });
  const group = await Group.create({
    name: 'Already Assigned Group',
    leaderId: leader.id,
    memberIds: [leader.id],
    advisorId: currentAdvisor.id,
    status: 'HAS_ADVISOR',
    maxMembers: 4,
  });

  const response = await request('/api/v1/advisor-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      groupId: group.id,
      professorId: requestedAdvisor.id,
    }),
  });

  assert.equal(response.response.status, 409);
  assert.equal(response.json.code, 'GROUP_ALREADY_HAS_ADVISOR');
});

test('team leader cannot submit advisor requests to multiple advisors while one request is pending', async () => {
  const leader = await createStudent({
    studentId: '11070001131',
    email: 'leader-pending-request@example.edu',
    fullName: 'Leader Pending Request',
    password: 'StrongPass1!',
  });
  const firstAdvisor = await createProfessorUser({
    email: 'pending-first-advisor@example.edu',
    fullName: 'Pending First Advisor',
  });
  const secondAdvisor = await createProfessorUser({
    email: 'pending-second-advisor@example.edu',
    fullName: 'Pending Second Advisor',
  });

  const group = await Group.create({
    name: 'Pending Request Group',
    leaderId: leader.id,
    memberIds: [leader.id],
    advisorId: null,
    status: 'FORMATION',
    maxMembers: 4,
  });

  const firstResponse = await request('/api/v1/advisor-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      groupId: group.id,
      professorId: firstAdvisor.id,
    }),
  });

  assert.equal(firstResponse.response.status, 201);

  const secondResponse = await request('/api/v1/advisor-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      groupId: group.id,
      professorId: secondAdvisor.id,
    }),
  });

  assert.equal(secondResponse.response.status, 409);
  assert.equal(secondResponse.json.code, 'GROUP_ALREADY_HAS_PENDING_REQUEST');
});

test('team leader submit flow creates advisor request and advisor inbox notification', async () => {
  const leader = await createStudent({
    studentId: '11070001170',
    email: 'mentor-submit-leader@example.edu',
    fullName: 'Mentor Submit Leader',
    password: 'StrongPass1!',
  });
  const advisor = await createProfessorUser({
    email: 'mentor-submit-advisor@example.edu',
    fullName: 'Mentor Submit Advisor',
  });
  const group = await Group.create({
    id: 'group-mentor-submit-1',
    name: 'Mentor Submit Group',
    leaderId: String(leader.id),
    memberIds: [],
    advisorId: null,
    status: 'FORMATION',
    maxMembers: 4,
  });

  const response = await request('/api/v1/advisor-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      groupId: group.id,
      advisorId: advisor.id,
    }),
  });

  assert.equal(response.response.status, 201);
  assert.equal(response.json.groupId, group.id);
  assert.equal(response.json.advisorId, advisor.id);
  assert.equal(response.json.teamLeaderId, leader.id);
  assert.equal(response.json.status, 'PENDING');

  const storedRequest = await AdvisorRequest.findByPk(response.json.id);
  assert.ok(storedRequest);
  assert.equal(storedRequest.status, 'PENDING');

  const storedNotification = await Notification.findOne({
    where: {
      userId: advisor.id,
      type: 'ADVISOR_REQUEST',
    },
    order: [['createdAt', 'DESC']],
  });
  assert.ok(storedNotification);

  const advisorInbox = await request('/api/v1/advisors/notifications/advisee-requests', {
    headers: await authHeaderFor(advisor),
  });

  assert.equal(advisorInbox.response.status, 200);
  assert.equal(advisorInbox.json.count, 1);
  assert.equal(advisorInbox.json.data[0].requestId, response.json.id);
  assert.equal(advisorInbox.json.data[0].groupId, group.id);
  assert.equal(advisorInbox.json.data[0].groupName, 'Mentor Submit Group');
});

test('advisor approval flow updates assignment, mirrors rows, writes audit log, and notifies the team leader', async () => {
  const leader = await createStudent({
    studentId: '11070001171',
    email: 'mentor-approve-leader@example.edu',
    fullName: 'Mentor Approve Leader',
    password: 'StrongPass1!',
  });
  const advisor = await createProfessorUser({
    email: 'mentor-approve-advisor@example.edu',
    fullName: 'Mentor Approve Advisor',
  });
  const group = await Group.create({
    id: 'group-mentor-approve-1',
    name: 'Mentor Approve Group',
    leaderId: String(leader.id),
    memberIds: [],
    advisorId: null,
    status: 'FORMATION',
    maxMembers: 4,
  });

  const submitResponse = await request('/api/v1/advisor-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      groupId: group.id,
      advisorId: advisor.id,
    }),
  });

  assert.equal(submitResponse.response.status, 201);

  const decisionResponse = await request(`/api/v1/advisor-requests/${submitResponse.json.id}/decision`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(advisor)),
    },
    body: JSON.stringify({
      decision: 'APPROVE',
      note: 'I can supervise this team.',
    }),
  });

  assert.equal(decisionResponse.response.status, 200);
  assert.equal(decisionResponse.json.status, 'APPROVED');

  const updatedGroup = await Group.findByPk(group.id);
  assert.equal(updatedGroup.advisorId, String(advisor.id));
  assert.equal(updatedGroup.status, 'HAS_ADVISOR');

  const mirroredRows = await GroupAdvisorAssignment.findAll({ where: { groupId: group.id } });
  assert.equal(mirroredRows.length, 1);
  assert.equal(mirroredRows[0].studentUserId, leader.id);
  assert.equal(mirroredRows[0].advisorUserId, advisor.id);

  const auditLog = await AuditLog.findOne({
    where: {
      action: 'ADVISOR_REQUEST_APPROVED',
      targetType: 'ADVISOR_REQUEST',
      targetId: submitResponse.json.id,
      actorId: advisor.id,
    },
  });
  assert.ok(auditLog);
  assert.equal(auditLog.metadata.groupId, group.id);
  assert.equal(auditLog.metadata.decision, 'APPROVE');

  const leaderNotifications = await request('/api/v1/team-leader/notifications/advisor-decisions', {
    headers: await authHeaderFor(leader),
  });

  assert.equal(leaderNotifications.response.status, 200);
  assert.equal(leaderNotifications.json.length, 1);
  assert.equal(leaderNotifications.json[0].requestId, submitResponse.json.id);
  assert.equal(leaderNotifications.json[0].groupId, group.id);
  assert.equal(leaderNotifications.json[0].advisorDecision, 'APPROVED');
  assert.equal(leaderNotifications.json[0].advisor.id, advisor.id);
});

test('advisor rejection flow writes audit log and notifies the team leader without assigning the group', async () => {
  const leader = await createStudent({
    studentId: '11070001172',
    email: 'mentor-reject-leader@example.edu',
    fullName: 'Mentor Reject Leader',
    password: 'StrongPass1!',
  });
  const advisor = await createProfessorUser({
    email: 'mentor-reject-advisor@example.edu',
    fullName: 'Mentor Reject Advisor',
  });
  const group = await Group.create({
    id: 'group-mentor-reject-1',
    name: 'Mentor Reject Group',
    leaderId: String(leader.id),
    memberIds: [],
    advisorId: null,
    status: 'FORMATION',
    maxMembers: 4,
  });

  const submitResponse = await request('/api/v1/advisor-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      groupId: group.id,
      advisorId: advisor.id,
    }),
  });

  assert.equal(submitResponse.response.status, 201);

  const decisionResponse = await request(`/api/v1/advisor-requests/${submitResponse.json.id}/decision`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(advisor)),
    },
    body: JSON.stringify({
      decision: 'REJECT',
      note: 'I am not available this term.',
    }),
  });

  assert.equal(decisionResponse.response.status, 200);
  assert.equal(decisionResponse.json.status, 'REJECTED');

  const refreshedGroup = await Group.findByPk(group.id);
  assert.equal(refreshedGroup.advisorId, null);
  assert.equal(refreshedGroup.status, 'FORMATION');

  const mirroredRows = await GroupAdvisorAssignment.findAll({ where: { groupId: group.id } });
  assert.equal(mirroredRows.length, 0);

  const auditLog = await AuditLog.findOne({
    where: {
      action: 'ADVISOR_REQUEST_REJECTED',
      targetType: 'ADVISOR_REQUEST',
      targetId: submitResponse.json.id,
      actorId: advisor.id,
    },
  });
  assert.ok(auditLog);
  assert.equal(auditLog.metadata.groupId, group.id);
  assert.equal(auditLog.metadata.decision, 'REJECT');

  const leaderNotifications = await request('/api/v1/team-leader/notifications/advisor-decisions', {
    headers: await authHeaderFor(leader),
  });

  assert.equal(leaderNotifications.response.status, 200);
  assert.equal(leaderNotifications.json.length, 1);
  assert.equal(leaderNotifications.json[0].groupId, group.id);
  assert.equal(leaderNotifications.json[0].advisorDecision, 'REJECTED');
});

test('advisor release flow clears assignment and notifies the team leader', async () => {
  const leader = await createStudent({
    studentId: '11070001173',
    email: 'mentor-release-leader@example.edu',
    fullName: 'Mentor Release Leader',
    password: 'StrongPass1!',
  });
  const advisor = await createProfessorUser({
    email: 'mentor-release-advisor@example.edu',
    fullName: 'Mentor Release Advisor',
  });
  const group = await Group.create({
    id: 'group-mentor-release-1',
    name: 'Mentor Release Group',
    leaderId: String(leader.id),
    memberIds: [],
    advisorId: String(advisor.id),
    status: 'HAS_ADVISOR',
    maxMembers: 4,
  });

  await GroupAdvisorAssignment.create({
    groupId: group.id,
    studentUserId: leader.id,
    advisorUserId: advisor.id,
  });

  const releaseResponse = await request(`/api/v1/groups/${group.id}/advisor-release`, {
    method: 'PATCH',
    headers: await authHeaderFor(advisor),
  });

  assert.equal(releaseResponse.response.status, 200);
  assert.equal(releaseResponse.json.code, 'SUCCESS');
  assert.equal(releaseResponse.json.data.groupId, group.id);
  assert.equal(releaseResponse.json.data.advisorId, null);

  const updatedGroup = await Group.findByPk(group.id);
  assert.equal(updatedGroup.advisorId, null);
  assert.equal(updatedGroup.status, 'LOOKING_FOR_ADVISOR');

  const mirroredRows = await GroupAdvisorAssignment.findAll({ where: { groupId: group.id } });
  assert.equal(mirroredRows.length, 0);

  const auditLog = await AuditLog.findOne({
    where: {
      action: 'ADVISOR_RELEASE',
      targetType: 'GROUP',
      targetId: group.id,
      actorId: advisor.id,
    },
  });
  assert.ok(auditLog);
  assert.equal(auditLog.metadata.groupId, group.id);
  assert.equal(auditLog.metadata.previousAdvisorId, String(advisor.id));

  const leaderNotifications = await request('/api/v1/team-leader/notifications/advisor-releases', {
    headers: await authHeaderFor(leader),
  });

  assert.equal(leaderNotifications.response.status, 200);
  assert.equal(leaderNotifications.json.length, 1);
  assert.equal(leaderNotifications.json[0].groupId, group.id);
  assert.equal(leaderNotifications.json[0].previousAdvisor.id, advisor.id);
});

test('coordinator transfer flow updates both notification endpoints for the new advisor and the team leader', async () => {
  const coordinator = await User.create({
    email: 'mentor-transfer-coordinator@example.edu',
    fullName: 'Mentor Transfer Coordinator',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const leader = await createStudent({
    studentId: '11070001174',
    email: 'mentor-transfer-leader@example.edu',
    fullName: 'Mentor Transfer Leader',
    password: 'StrongPass1!',
  });
  const currentAdvisor = await createProfessorUser({
    email: 'mentor-transfer-current@example.edu',
    fullName: 'Mentor Transfer Current',
  });
  const newAdvisor = await createProfessorUser({
    email: 'mentor-transfer-new@example.edu',
    fullName: 'Mentor Transfer New',
  });
  const group = await Group.create({
    id: 'group-mentor-transfer-1',
    name: 'Mentor Transfer Group',
    leaderId: String(leader.id),
    memberIds: [],
    advisorId: String(currentAdvisor.id),
    status: 'HAS_ADVISOR',
    maxMembers: 4,
  });

  await GroupAdvisorAssignment.create({
    groupId: group.id,
    studentUserId: leader.id,
    advisorUserId: currentAdvisor.id,
  });

  const transferResponse = await request(`/api/v1/coordinator/groups/${group.id}/advisor-transfer`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({
      newAdvisorId: newAdvisor.id,
      reason: 'Load balancing',
    }),
  });

  assert.equal(transferResponse.response.status, 200);
  assert.equal(transferResponse.json.groupId, group.id);
  assert.equal(transferResponse.json.advisorId, String(newAdvisor.id));

  const teamLeaderTransfers = await request('/api/v1/team-leader/notifications/advisor-transfers', {
    headers: await authHeaderFor(leader),
  });

  assert.equal(teamLeaderTransfers.response.status, 200);
  assert.equal(teamLeaderTransfers.json.length, 1);
  assert.equal(teamLeaderTransfers.json[0].groupId, group.id);
  assert.equal(teamLeaderTransfers.json[0].newAdvisor.id, newAdvisor.id);

  const advisorTransfers = await request('/api/v1/advisors/notifications/group-transfers', {
    headers: await authHeaderFor(newAdvisor),
  });

  assert.equal(advisorTransfers.response.status, 200);
  assert.equal(advisorTransfers.json.count, 1);
  assert.equal(advisorTransfers.json.data[0].groupId, group.id);
  assert.equal(advisorTransfers.json.data[0].groupName, 'Mentor Transfer Group');

  const auditLog = await AuditLog.findOne({
    where: {
      action: 'ADVISOR_TRANSFER',
      targetType: 'GROUP',
      targetId: group.id,
      actorId: coordinator.id,
    },
  });
  assert.ok(auditLog);
  assert.equal(auditLog.metadata.groupId, group.id);
  assert.equal(auditLog.metadata.previousAdvisorId, String(currentAdvisor.id));
  assert.equal(auditLog.metadata.newAdvisorId, String(newAdvisor.id));
});

test('orphan cleanup flow writes the sanitization audit log', async () => {
  const admin = await User.create({
    email: 'mentor-orphan-admin@example.edu',
    fullName: 'Mentor Orphan Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const group = await Group.create({
    name: 'Mentor Orphan Group',
    leaderId: null,
    memberIds: [],
    advisorId: null,
    status: 'LOOKING_FOR_ADVISOR',
    maxMembers: 4,
  });

  const cleanupResponse = await request(`/api/v1/group-database/groups/${group.id}`, {
    method: 'DELETE',
    headers: await authHeaderFor(admin),
  });

  assert.equal(cleanupResponse.response.status, 200);

  const auditLog = await AuditLog.findOne({
    where: {
      action: 'DELETE_ORPHAN_GROUP',
      targetType: 'GROUP',
      targetId: group.id,
      actorId: admin.id,
    },
  });

  assert.ok(auditLog);
  assert.equal(auditLog.metadata.groupName, 'Mentor Orphan Group');
});

test('coordinator membership edit blocks adding the leader and enforces group max capacity', async () => {
  const coordinator = await User.create({
    email: 'coordinator-capacity@example.edu',
    fullName: 'Coordinator Capacity',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const leader = await createStudent({
    studentId: '11070001122',
    email: 'coordinator-capacity-leader@example.edu',
    fullName: 'Coordinator Capacity Leader',
    password: 'StrongPass1!',
  });
  const member = await createStudent({
    studentId: '11070001123',
    email: 'coordinator-capacity-member@example.edu',
    fullName: 'Coordinator Capacity Member',
    password: 'StrongPass1!',
  });
  const extraStudent = await createStudent({
    studentId: '11070001124',
    email: 'coordinator-capacity-extra@example.edu',
    fullName: 'Coordinator Capacity Extra',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    id: 'group-membership-capacity-1',
    name: 'Capacity Group',
    leaderId: String(leader.id),
    memberIds: [String(member.id)],
    maxMembers: 2,
    status: 'FORMATION',
  });

  const leaderAddResponse = await request(`/api/v1/coordinator/groups/${group.id}/members`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({
      action: 'ADD',
      studentId: leader.studentId,
    }),
  });

  assert.equal(leaderAddResponse.response.status, 400);
  assert.equal(leaderAddResponse.json.code, 'MEMBERSHIP_NO_CHANGE');

  const overCapacityResponse = await request(`/api/v1/coordinator/groups/${group.id}/members`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({
      action: 'ADD',
      studentId: extraStudent.studentId,
    }),
  });

  assert.equal(overCapacityResponse.response.status, 409);
  assert.equal(overCapacityResponse.json.code, 'GROUP_FULL');
});

test('group leader invite dispatch enforces current capacity and available slots', async () => {
  const leader = await createStudent({
    studentId: '11070001150',
    email: 'invite-capacity-leader@example.edu',
    fullName: 'Invite Capacity Leader',
    password: 'StrongPass1!',
  });
  const member = await createStudent({
    studentId: '11070001151',
    email: 'invite-capacity-member@example.edu',
    fullName: 'Invite Capacity Member',
    password: 'StrongPass1!',
  });
  const inviteeOne = await createStudent({
    studentId: '11070001152',
    email: 'invite-capacity-one@example.edu',
    fullName: 'Invite Capacity One',
    password: 'StrongPass1!',
  });
  const inviteeTwo = await createStudent({
    studentId: '11070001153',
    email: 'invite-capacity-two@example.edu',
    fullName: 'Invite Capacity Two',
    password: 'StrongPass1!',
  });
  const inviteeThree = await createStudent({
    studentId: '11070001158',
    email: 'invite-capacity-three@example.edu',
    fullName: 'Invite Capacity Three',
    password: 'StrongPass1!',
  });

  const fullGroup = await Group.create({
    id: 'group-invite-capacity-full',
    name: 'Full Invite Group',
    leaderId: String(leader.id),
    memberIds: [String(member.id)],
    maxMembers: 2,
    status: 'FORMATION',
  });

  const fullGroupResponse = await request(`/api/v1/groups/${fullGroup.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [inviteeOne.studentId],
    }),
  });

  assert.equal(fullGroupResponse.response.status, 409);
  assert.equal(fullGroupResponse.json.code, 'GROUP_FULL');

  const limitedGroup = await Group.create({
    id: 'group-invite-capacity-limited',
    name: 'Limited Invite Group',
    leaderId: String(leader.id),
    memberIds: [],
    maxMembers: 3,
    status: 'FORMATION',
  });

  const overInviteResponse = await request(`/api/v1/groups/${limitedGroup.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [inviteeOne.studentId, inviteeTwo.studentId, inviteeThree.studentId],
    }),
  });

  assert.equal(overInviteResponse.response.status, 409);
  assert.equal(overInviteResponse.json.code, 'INVITE_CAPACITY_EXCEEDED');
});

test('group leader invite dispatch treats pending invitations as reserved capacity', async () => {
  const leader = await createStudent({
    studentId: '11070001154',
    email: 'invite-pending-capacity-leader@example.edu',
    fullName: 'Invite Pending Capacity Leader',
    password: 'StrongPass1!',
  });
  const member = await createStudent({
    studentId: '11070001155',
    email: 'invite-pending-capacity-member@example.edu',
    fullName: 'Invite Pending Capacity Member',
    password: 'StrongPass1!',
  });
  const pendingInvitee = await createStudent({
    studentId: '11070001156',
    email: 'invite-pending-capacity-pending@example.edu',
    fullName: 'Invite Pending Capacity Pending',
    password: 'StrongPass1!',
  });
  const newInvitee = await createStudent({
    studentId: '11070001157',
    email: 'invite-pending-capacity-new@example.edu',
    fullName: 'Invite Pending Capacity New',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    id: 'group-invite-pending-capacity',
    name: 'Pending Capacity Group',
    leaderId: String(leader.id),
    memberIds: [String(member.id)],
    maxMembers: 3,
    status: 'FORMATION',
  });

  await Invitation.create({
    groupId: group.id,
    inviteeId: pendingInvitee.id,
    status: 'PENDING',
  });

  const blockedResponse = await request(`/api/v1/groups/${group.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [newInvitee.studentId],
    }),
  });

  assert.equal(blockedResponse.response.status, 409);
  assert.equal(blockedResponse.json.code, 'GROUP_FULL');

  const retryPendingResponse = await request(`/api/v1/groups/${group.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [pendingInvitee.studentId],
    }),
  });

  assert.equal(retryPendingResponse.response.status, 201);
  assert.equal(retryPendingResponse.json.created.length, 0);
  assert.deepEqual(retryPendingResponse.json.skippedStudentIds, [pendingInvitee.studentId]);
});

test('group leader can re-invite a student after the previous invitation was rejected', async () => {
  const leader = await createStudent({
    studentId: '11070001160',
    email: 'reinvite-leader@example.edu',
    fullName: 'Reinvite Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001161',
    email: 'reinvite-invitee@example.edu',
    fullName: 'Reinvite Invitee',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    id: 'group-reinvite-after-reject',
    name: 'Reinvite Group',
    leaderId: String(leader.id),
    memberIds: [],
    maxMembers: 4,
    status: 'FORMATION',
  });

  const firstInvite = await request(`/api/v1/groups/${group.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [invitee.studentId],
    }),
  });

  assert.equal(firstInvite.response.status, 201);
  assert.equal(firstInvite.json.created.length, 1);

  const invitationId = firstInvite.json.created[0].id;

  const rejectResponse = await request(`/api/v1/invitations/${invitationId}/response`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(invitee)),
    },
    body: JSON.stringify({
      response: 'REJECT',
    }),
  });

  assert.equal(rejectResponse.response.status, 200);
  assert.equal(rejectResponse.json.invitation.status, 'REJECTED');

  const secondInvite = await request(`/api/v1/groups/${group.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [invitee.studentId],
    }),
  });

  assert.equal(secondInvite.response.status, 201);
  assert.equal(secondInvite.json.created.length, 1);
  assert.equal(secondInvite.json.created[0].id, invitationId);
  assert.equal(secondInvite.json.created[0].status, 'PENDING');

  const refreshedInvitation = await Invitation.findByPk(invitationId);
  assert.equal(refreshedInvitation.status, 'PENDING');
});

test('group leader can re-invite a student after the previous invitation was accepted and membership was cleared', async () => {
  const leader = await createStudent({
    studentId: '11070001162',
    email: 'reinvite-accepted-leader@example.edu',
    fullName: 'Reinvite Accepted Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001163',
    email: 'reinvite-accepted-invitee@example.edu',
    fullName: 'Reinvite Accepted Invitee',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    id: 'group-reinvite-after-accept',
    name: 'Reinvite Accepted Group',
    leaderId: String(leader.id),
    memberIds: [],
    maxMembers: 4,
    status: 'FORMATION',
  });

  const firstInvite = await request(`/api/v1/groups/${group.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [invitee.studentId],
    }),
  });

  assert.equal(firstInvite.response.status, 201);
  const invitationId = firstInvite.json.created[0].id;

  const acceptResponse = await request(`/api/v1/invitations/${invitationId}/response`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(invitee)),
    },
    body: JSON.stringify({
      response: 'ACCEPT',
    }),
  });

  assert.equal(acceptResponse.response.status, 200);
  assert.equal(acceptResponse.json.invitation.status, 'ACCEPTED');

  const updatedGroup = await Group.findByPk(group.id);
  updatedGroup.memberIds = [];
  await updatedGroup.save();

  const secondInvite = await request(`/api/v1/groups/${group.id}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: [invitee.studentId],
    }),
  });

  assert.equal(secondInvite.response.status, 201);
  assert.equal(secondInvite.json.created.length, 1);
  assert.equal(secondInvite.json.created[0].id, invitationId);
  assert.equal(secondInvite.json.created[0].status, 'PENDING');
});

test('group leader cannot lower maxMembers below current participant count', async () => {
  const leader = await createStudent({
    studentId: '11070001125',
    email: 'rename-max-leader@example.edu',
    fullName: 'Rename Max Leader',
    password: 'StrongPass1!',
  });
  const memberOne = await createStudent({
    studentId: '11070001126',
    email: 'rename-max-member-one@example.edu',
    fullName: 'Rename Max Member One',
    password: 'StrongPass1!',
  });
  const memberTwo = await createStudent({
    studentId: '11070001127',
    email: 'rename-max-member-two@example.edu',
    fullName: 'Rename Max Member Two',
    password: 'StrongPass1!',
  });

  const group = await Group.create({
    id: 'group-rename-max-1',
    name: 'Rename Max Group',
    leaderId: String(leader.id),
    memberIds: [String(memberOne.id), String(memberTwo.id)],
    maxMembers: 5,
    status: 'FORMATION',
  });

  const response = await request(`/api/v1/groups/${group.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      maxMembers: 2,
    }),
  });

  assert.equal(response.response.status, 400);
  assert.equal(response.json.code, 'INVALID_MAX_MEMBERS');

  const unchangedGroup = await Group.findByPk(group.id);
  assert.equal(unchangedGroup.maxMembers, 5);
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

test('team leader can submit a new request to the same advisor after advisor release', async () => {
  const leader = await createStudent({
    studentId: '11070001002',
    email: 'leader-rerequest@example.edu',
    fullName: 'Leader Rerequest',
    password: 'StrongPass1!',
  });
  const advisor = await createProfessorUser({
    email: 'advisor-rerequest@example.edu',
    fullName: 'Advisor Rerequest',
  });
  const group = await Group.create({
    name: 'Rerequest Group',
    leaderId: leader.id,
    memberIds: [leader.id],
    advisorId: advisor.id,
    status: 'HAS_ADVISOR',
    maxMembers: 4,
  });

  await AdvisorRequest.create({
    id: '33333333-3333-3333-3333-333333333333',
    groupId: group.id,
    advisorId: advisor.id,
    teamLeaderId: leader.id,
    status: 'APPROVED',
  });

  await request(`/api/v1/groups/${group.id}/advisor-release`, {
    method: 'PATCH',
    headers: await authHeaderFor(advisor),
  });

  const retryResponse = await request('/api/v1/advisor-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      groupId: group.id,
      professorId: advisor.id,
    }),
  });

  assert.equal(retryResponse.response.status, 201);
  assert.equal(retryResponse.json.status, 'PENDING');
  assert.equal(retryResponse.json.advisorId, advisor.id);
});

// ─── Committee Review ───────────────────────────────────────────────────────

async function seedTestRubric() {
  return RubricCriterion.bulkCreate([
    { deliverableType: 'PROPOSAL', question: 'Technical Feasibility', criterionType: 'SOFT', maxPoints: 10, weight: 0.4 },
    { deliverableType: 'PROPOSAL', question: 'Project Scope Clarity', criterionType: 'SOFT', maxPoints: 10, weight: 0.4 },
    { deliverableType: 'PROPOSAL', question: 'Team Qualification', criterionType: 'BINARY', maxPoints: 5, weight: 0.2 },
  ]);
}

test('PROFESSOR can submit a review and finalScore is mathematically correct', async () => {
  const criteria = await seedTestRubric();
  const professor = await createProfessorUser({ email: 'reviewer1@example.edu', fullName: 'Reviewer One' });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-test-1',
    type: 'PROPOSAL',
    content: 'Proposal content',
    status: 'SUBMITTED',
  });

  const scores = [
    { criterionId: criteria[0].id, value: 8 },
    { criterionId: criteria[1].id, value: 7 },
    { criterionId: criteria[2].id, value: 5 },
  ];

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(professor)) },
      body: JSON.stringify({ scores, comments: 'Good work' }),
    }
  );

  assert.equal(response.status, 201);
  assert.ok(json.id);
  assert.equal(json.submissionId, submission.id);
  assert.equal(json.reviewerId, professor.id);
  assert.equal(json.comments, 'Good work');
  // (8/10)*0.4 + (7/10)*0.4 + (5/5)*0.2 = 0.32 + 0.28 + 0.20 = 0.80 / 1.0 * 100 = 80.0
  assert.ok(Math.abs(json.finalScore - 80.0) < 0.001);
});

test('non-PROFESSOR gets 403 when submitting a committee review', async () => {
  const criteria = await seedTestRubric();
  const student = await createStudent({
    studentId: '11070001011',
    email: 'student-committee@example.edu',
    fullName: 'Student User',
    password: 'StrongPass1!',
  });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-test-2',
    type: 'PROPOSAL',
    content: 'content',
    status: 'SUBMITTED',
  });

  const { response } = await request(
    `/api/v1/committee/submissions/${submission.id}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(student)) },
      body: JSON.stringify({ scores: [{ criterionId: criteria[0].id, value: 8 }] }),
    }
  );

  assert.equal(response.status, 403);
});

test('review for nonexistent submission returns 404 SUBMISSION_NOT_FOUND', async () => {
  const criteria = await seedTestRubric();
  const professor = await createProfessorUser({ email: 'reviewer2@example.edu', fullName: 'Reviewer Two' });

  const { response, json } = await request(
    '/api/v1/committee/submissions/nonexistent-uuid/review',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(professor)) },
      body: JSON.stringify({ scores: [{ criterionId: criteria[0].id, value: 5 }] }),
    }
  );

  assert.equal(response.status, 404);
  assert.equal(json.code, 'SUBMISSION_NOT_FOUND');
});

test('two professors can each submit a review; CommitteeReviews table gets 2 rows', async () => {
  const criteria = await seedTestRubric();
  const prof1 = await createProfessorUser({ email: 'multi-prof1@example.edu', fullName: 'Prof One' });
  const prof2 = await createProfessorUser({ email: 'multi-prof2@example.edu', fullName: 'Prof Two' });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-multi',
    type: 'PROPOSAL',
    content: 'multi-reviewer content',
    status: 'SUBMITTED',
  });

  const scores = criteria.map((c) => ({ criterionId: c.id, value: c.maxPoints }));

  const r1 = await request(`/api/v1/committee/submissions/${submission.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(prof1)) },
    body: JSON.stringify({ scores }),
  });
  const r2 = await request(`/api/v1/committee/submissions/${submission.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(prof2)) },
    body: JSON.stringify({ scores }),
  });

  assert.equal(r1.response.status, 201);
  assert.equal(r2.response.status, 201);
  assert.notEqual(r1.json.id, r2.json.id);

  const reviews = await CommitteeReview.findAll({ where: { submissionId: submission.id } });
  assert.equal(reviews.length, 2);
});

test('submission status becomes GRADED after a committee review', async () => {
  const criteria = await seedTestRubric();
  const professor = await createProfessorUser({ email: 'grade-check@example.edu', fullName: 'Grade Checker' });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-grade',
    type: 'PROPOSAL',
    content: 'content',
    status: 'SUBMITTED',
  });

  const scores = criteria.map((c) => ({ criterionId: c.id, value: c.maxPoints / 2 }));

  await request(`/api/v1/committee/submissions/${submission.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(professor)) },
    body: JSON.stringify({ scores }),
  });

  await submission.reload();
  assert.equal(submission.status, 'GRADED');
});

test('invalid criterionId in scores returns 400 INVALID_CRITERION_ID', async () => {
  await seedTestRubric();
  const professor = await createProfessorUser({ email: 'invalid-crit@example.edu', fullName: 'Bad Crit' });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-invalid',
    type: 'PROPOSAL',
    content: 'content',
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(professor)) },
      body: JSON.stringify({ scores: [{ criterionId: 'does-not-exist-uuid', value: 5 }] }),
    }
  );

  assert.equal(response.status, 400);
  assert.equal(json.code, 'INVALID_CRITERION_ID');
});

test('duplicate criterionId in scores returns 400 DUPLICATE_CRITERION_ID', async () => {
  const criteria = await seedTestRubric();
  const professor = await createProfessorUser({ email: 'dup-crit@example.edu', fullName: 'Dup Crit' });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-dup-crit',
    type: 'PROPOSAL',
    content: 'content',
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(professor)) },
      body: JSON.stringify({
        scores: [
          { criterionId: criteria[0].id, value: 5 },
          { criterionId: criteria[0].id, value: 8 },
        ],
      }),
    }
  );

  assert.equal(response.status, 400);
  assert.equal(json.code, 'DUPLICATE_CRITERION_ID');
});

test('score exceeding maxPoints returns 400 SCORE_EXCEEDS_MAX', async () => {
  const criteria = await seedTestRubric();
  const professor = await createProfessorUser({ email: 'oob-score@example.edu', fullName: 'OOB Score' });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-oob-score',
    type: 'PROPOSAL',
    content: 'content',
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(professor)) },
      body: JSON.stringify({
        scores: [
          { criterionId: criteria[0].id, value: criteria[0].maxPoints + 1 },
          { criterionId: criteria[1].id, value: criteria[1].maxPoints },
          { criterionId: criteria[2].id, value: criteria[2].maxPoints },
        ],
      }),
    }
  );

  assert.equal(response.status, 400);
  assert.equal(json.code, 'SCORE_EXCEEDS_MAX');
});

test('criteria from wrong deliverableType returns 400 INVALID_CRITERION_ID', async () => {
  const proposalCriteria = await seedTestRubric();
  const sowCriteria = await RubricCriterion.bulkCreate([
    { deliverableType: 'SOW', question: 'SOW Budget Clarity', criterionType: 'SOFT', maxPoints: 10, weight: 1.0 },
  ]);
  const professor = await createProfessorUser({ email: 'wrong-type@example.edu', fullName: 'Wrong Type' });
  const submission = await DeliverableSubmission.create({
    groupId: 'group-wrong-type',
    type: 'PROPOSAL',
    content: 'content',
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaderFor(professor)) },
      body: JSON.stringify({
        scores: [
          { criterionId: sowCriteria[0].id, value: 5 },
        ],
      }),
    }
  );

  assert.equal(response.status, 400);
  assert.equal(json.code, 'INVALID_CRITERION_ID');
});
