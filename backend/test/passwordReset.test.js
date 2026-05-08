require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const { User, PasswordResetToken } = require('../models');
const { hashToken } = require('../services/passwordResetService');

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

async function createUser({ email, fullName, role, password = 'OldPass123!' }) {
  const hashedPassword = await bcrypt.hash(password, 10);
  return User.create({
    email,
    fullName,
    role,
    status: 'ACTIVE',
    password: hashedPassword,
    passwordHash: role === 'STUDENT' ? hashedPassword : null,
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
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  await PasswordResetToken.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('admin can generate a one-time password reset link without storing plaintext token', async () => {
  const admin = await createUser({
    email: 'admin-reset@example.edu',
    fullName: 'Reset Admin',
    role: 'ADMIN',
  });
  const professor = await createUser({
    email: 'prof-reset@example.edu',
    fullName: 'Reset Professor',
    role: 'PROFESSOR',
  });

  const result = await request(`/api/v1/admin/users/${professor.id}/password-reset-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(admin),
    },
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.json.message, 'Password reset link generated successfully');
  assert.match(result.json.resetLink, /^http:\/\/localhost:5173\/reset-password\?token=/);

  const token = new URL(result.json.resetLink).searchParams.get('token');
  assert.ok(token);

  const rows = await PasswordResetToken.findAll({ where: { userId: professor.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokenHash, hashToken(token));
  assert.notEqual(rows[0].tokenHash, token);
  assert.equal(rows[0].usedAt, null);
  assert.equal(rows[0].invalidatedAt, null);
});

test('non-admin users cannot generate reset links', async () => {
  const student = await createUser({
    email: 'student-reset@example.edu',
    fullName: 'Reset Student',
    role: 'STUDENT',
  });
  const target = await createUser({
    email: 'target-reset@example.edu',
    fullName: 'Target User',
    role: 'ADMIN',
  });

  const result = await request(`/api/v1/admin/users/${target.id}/password-reset-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(student),
    },
  });

  assert.equal(result.response.status, 403);
  assert.equal(result.json.code, 'FORBIDDEN');
});

test('reset password updates user password and prevents token reuse', async () => {
  const admin = await createUser({
    email: 'admin-use@example.edu',
    fullName: 'Use Admin',
    role: 'ADMIN',
  });
  const target = await createUser({
    email: 'target-use@example.edu',
    fullName: 'Use Target',
    role: 'ADMIN',
    password: 'OldPass123!',
  });

  const generated = await request(`/api/v1/admin/users/${target.id}/password-reset-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(admin),
    },
  });
  const token = new URL(generated.json.resetLink).searchParams.get('token');

  const reset = await request('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      newPassword: 'NewPassword123.',
    }),
  });

  assert.equal(reset.response.status, 200);
  assert.equal(reset.json.code, 'PASSWORD_RESET_SUCCESS');

  const login = await request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: target.email,
      password: 'NewPassword123.',
    }),
  });
  assert.equal(login.response.status, 200);

  const reuse = await request('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      newPassword: 'AnotherPass123.',
    }),
  });

  assert.equal(reuse.response.status, 400);
  assert.equal(reuse.json.code, 'RESET_TOKEN_USED');
});

test('password reset invalidates previously issued authenticated sessions for that user', async () => {
  const admin = await createUser({
    email: 'admin-session@example.edu',
    fullName: 'Session Admin',
    role: 'ADMIN',
  });
  const target = await createUser({
    email: 'target-session@example.edu',
    fullName: 'Session Target',
    role: 'STUDENT',
  });
  const oldAuthHeader = authHeaderFor(target);

  const generated = await request(`/api/v1/admin/users/${target.id}/password-reset-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(admin),
    },
  });
  const token = new URL(generated.json.resetLink).searchParams.get('token');

  const reset = await request('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      newPassword: 'NewPassword123.',
    }),
  });
  assert.equal(reset.response.status, 200);

  const staleSession = await request('/api/v1/students/me', {
    headers: oldAuthHeader,
  });

  assert.equal(staleSession.response.status, 401);
  assert.equal(staleSession.json.code, 'SESSION_EXPIRED');
});

test('concurrent reset attempts with the same token only allow one success', async () => {
  const admin = await createUser({
    email: 'admin-race@example.edu',
    fullName: 'Race Admin',
    role: 'ADMIN',
  });
  const target = await createUser({
    email: 'target-race@example.edu',
    fullName: 'Race Target',
    role: 'PROFESSOR',
  });

  const generated = await request(`/api/v1/admin/users/${target.id}/password-reset-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(admin),
    },
  });
  const token = new URL(generated.json.resetLink).searchParams.get('token');

  const attempts = await Promise.all([
    request('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        newPassword: 'NewPassword123.',
      }),
    }),
    request('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        newPassword: 'AnotherPass123.',
      }),
    }),
  ]);

  const successCount = attempts.filter((attempt) => attempt.response.status === 200).length;
  const usedCount = attempts.filter((attempt) => attempt.json.code === 'RESET_TOKEN_USED').length;

  assert.equal(successCount, 1);
  assert.equal(usedCount, 1);
});

test('expired reset token is rejected', async () => {
  const admin = await createUser({
    email: 'admin-expired@example.edu',
    fullName: 'Expired Admin',
    role: 'ADMIN',
  });
  const target = await createUser({
    email: 'target-expired@example.edu',
    fullName: 'Expired Target',
    role: 'PROFESSOR',
  });

  const token = 'expired-token-value';
  await PasswordResetToken.create({
    userId: target.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() - 60 * 1000),
    createdByAdminId: admin.id,
  });

  const result = await request('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      newPassword: 'NewPassword123.',
    }),
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.json.code, 'RESET_TOKEN_EXPIRED');
});

test('generating a new link invalidates earlier active reset tokens for the same user', async () => {
  const admin = await createUser({
    email: 'admin-invalidate@example.edu',
    fullName: 'Invalidate Admin',
    role: 'ADMIN',
  });
  const target = await createUser({
    email: 'target-invalidate@example.edu',
    fullName: 'Invalidate Target',
    role: 'PROFESSOR',
  });

  const first = await request(`/api/v1/admin/users/${target.id}/password-reset-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(admin),
    },
  });
  const firstToken = new URL(first.json.resetLink).searchParams.get('token');

  await request(`/api/v1/admin/users/${target.id}/password-reset-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(admin),
    },
  });

  const oldTokenAttempt = await request('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: firstToken,
      newPassword: 'NewPassword123.',
    }),
  });

  assert.equal(oldTokenAttempt.response.status, 400);
  assert.equal(oldTokenAttempt.json.code, 'RESET_TOKEN_INVALID');
});
