const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
process.env.SQLITE_STORAGE = ':memory:';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.GITHUB_CLIENT_ID = '';
process.env.GITHUB_CLIENT_SECRET = '';

const sequelize = require('../db');
const app = require('../app');
require('../models');
const { User, Professor, LinkedGitHubAccount, OAuthState } = require('../models');
const { ensureValidStudentRegistry } = require('../services/studentService');
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
  await LinkedGitHubAccount.destroy({ where: {} });
  await OAuthState.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('admin can register professor and duplicate email returns 409', async () => {
  const admin = await User.create({
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(admin)),
  };

  const createResult = await request('/api/v1/admin/professors', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: 'prof@example.edu',
      fullName: 'Prof Example',
      department: 'Software Engineering',
    }),
  });

  assert.equal(createResult.response.status, 201);
  assert.equal(createResult.json.setupTokenGenerated, true);
  assert.equal(createResult.json.message, 'Professor account created. Password setup link generated.');

  const duplicateResult = await request('/api/v1/admin/professors', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: 'prof@example.edu',
      fullName: 'Prof Example',
      department: 'Software Engineering',
    }),
  });

  assert.equal(duplicateResult.response.status, 409);
});

test('professor can set an initial password with a valid setup token', async () => {
  const setupToken = 'pst_test_setup_token';
  const professorUser = await User.create({
    email: 'passwordsetup@example.edu',
    fullName: 'Password Setup Professor',
    role: 'PROFESSOR',
    status: 'PASSWORD_SETUP_REQUIRED',
    passwordSetupTokenHash: professorService.hashToken(setupToken),
    passwordSetupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  await Professor.create({
    userId: professorUser.id,
    department: 'Software Engineering',
  });

  const invalidPassword = await request('/api/v1/professors/password-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupToken,
      newPassword: 'weak',
    }),
  });

  assert.equal(invalidPassword.response.status, 422);

  const successResult = await request('/api/v1/professors/password-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupToken,
      newPassword: 'StrongPass1!',
    }),
  });

  assert.equal(successResult.response.status, 200);
  assert.equal(successResult.json.message, 'Password set successfully');

  const updatedProfessorUser = await User.findOne({
    where: { email: 'passwordsetup@example.edu' },
  });

  assert.equal(updatedProfessorUser.status, 'ACTIVE');
  assert.equal(typeof updatedProfessorUser.password, 'string');
  assert.equal(updatedProfessorUser.passwordSetupTokenHash, null);
  assert.equal(updatedProfessorUser.passwordSetupTokenExpiresAt, null);
});

test('student registration validates eligibility, password strength, duplication, and success', async () => {
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

  assert.equal(created.response.status, 201);
  assert.equal(created.json.valid, true);

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
});

test('github linking flow rejects unauthenticated requests and links account after callback', async () => {
  const registration = await request('/api/v1/students/registration-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: '11070001000',
      email: 'student@example.edu',
      fullName: 'GitHub Student',
      password: 'StrongPass1!',
    }),
  });

  const unauthenticated = await request('/api/v1/students/me/github/link');
  assert.equal(unauthenticated.response.status, 401);

  const student = await User.findByPk(registration.json.userId);
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
  const registration = await request('/api/v1/students/registration-validation', {
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
  await request('/api/v1/students/registration-validation', {
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
