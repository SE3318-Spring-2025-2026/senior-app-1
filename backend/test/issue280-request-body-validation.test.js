require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const models = require('../models');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

const {
  CommitteeReview,
  Grade,
  DeliverableSubmission,
  GroupDeliverable,
  Deliverable,
  DeliverableRubric,
  DeliverableWeightConfiguration,
  SprintWeightConfiguration,
  GradingRubric,
  GroupAdvisorAssignment,
  Invitation,
  AdvisorRequest,
  Notification,
  AuditLog,
  LinkedGitHubAccount,
  OAuthState,
  Group,
  Professor,
  User,
} = models;

let server;
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function destroyIfPresent(Model) {
  if (Model) {
    await Model.destroy({ where: {} });
  }
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
  await destroyIfPresent(CommitteeReview);
  await destroyIfPresent(Grade);
  await destroyIfPresent(DeliverableSubmission);
  await destroyIfPresent(GroupDeliverable);
  await destroyIfPresent(Deliverable);
  await destroyIfPresent(DeliverableRubric);
  await destroyIfPresent(DeliverableWeightConfiguration);
  await destroyIfPresent(SprintWeightConfiguration);
  await destroyIfPresent(GradingRubric);
  await destroyIfPresent(GroupAdvisorAssignment);
  await destroyIfPresent(Invitation);
  await destroyIfPresent(AdvisorRequest);
  await destroyIfPresent(Notification);
  await destroyIfPresent(AuditLog);
  await destroyIfPresent(LinkedGitHubAccount);
  await destroyIfPresent(OAuthState);
  await destroyIfPresent(Group);
  await destroyIfPresent(Professor);
  await destroyIfPresent(User);
});

test('rejects missing JSON body on admin login with a standardized 400 response', async () => {
  const { response, json } = await request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.message, 'Request body must not be null or empty');
  assert.deepEqual(json.errors, {
    body: ['Request body must not be null or empty'],
  });
});

test('rejects missing JSON body before invitation response handler reads req.body', async () => {
  const student = await createStudent({
    studentId: '11070001991',
    email: 'issue280-student@example.edu',
    fullName: 'Issue 280 Student',
    password: 'StrongPass1!',
  });

  const { response, json } = await request('/api/v1/invitations/invite-1/respond', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(student),
    },
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.message, 'Request body must not be null or empty');
});

test('rejects empty object payloads on body-backed routes', async () => {
  const { response, json } = await request('/api/v1/groups/group-1/membership/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.message, 'Request body must not be null or empty');
});

test('does not enforce the middleware on bodyless write routes', async () => {
  const { response, json } = await request('/api/v1/groups/group-1/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 401);
  assert.equal(json.message, 'Access denied');
});
