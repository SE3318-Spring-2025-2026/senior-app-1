const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
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

test('professor can set an initial password with email while setup is pending', async () => {
  await User.create({
    email: 'emailsetup@example.edu',
    fullName: 'Email Setup Professor',
    role: 'PROFESSOR',
    status: 'PASSWORD_SETUP_REQUIRED',
  });

  const invalidPassword = await request('/api/v1/professors/password-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'emailsetup@example.edu',
      newPassword: 'weak',
    }),
  });

  assert.equal(invalidPassword.response.status, 422);

  const successResult = await request('/api/v1/professors/password-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'emailsetup@example.edu',
      newPassword: 'StrongPass1!',
    }),
  });

  assert.equal(successResult.response.status, 200);
  assert.equal(successResult.json.message, 'Password set successfully');

  const updatedProfessorUser = await User.findOne({
    where: { email: 'emailsetup@example.edu' },
  });

  assert.equal(updatedProfessorUser.status, 'ACTIVE');
  assert.equal(typeof updatedProfessorUser.password, 'string');

  const repeatedAttempt = await request('/api/v1/professors/password-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'emailsetup@example.edu',
      newPassword: 'AnotherStrong1!',
    }),
  });

  assert.equal(repeatedAttempt.response.status, 409);
  assert.equal(repeatedAttempt.json.errorCode, 'PROFESSOR_SETUP_ALREADY_COMPLETED');
});

test('password setup token verification enforces admin auth and returns valid true or false correctly', async () => {
  const unauthenticated = await request('/api/v1/password-setup-token-store/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupToken: 'pst_missing_auth',
    }),
  });

  assert.equal(unauthenticated.response.status, 401);

  const student = await User.create({
    email: 'verify-student@example.edu',
    fullName: 'Verify Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    studentId: '11070001000',
  });

  const forbidden = await request('/api/v1/password-setup-token-store/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(student)),
    },
    body: JSON.stringify({
      setupToken: 'pst_forbidden',
    }),
  });

  assert.equal(forbidden.response.status, 403);

  const admin = await User.create({
    email: 'verify-admin@example.edu',
    fullName: 'Verify Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(admin)),
  };

  const validSetupToken = 'pst_valid_token';
  const validProfessorUser = await User.create({
    email: 'verify-prof@example.edu',
    fullName: 'Verify Professor',
    role: 'PROFESSOR',
    status: 'PASSWORD_SETUP_REQUIRED',
    passwordSetupTokenHash: professorService.hashToken(validSetupToken),
    passwordSetupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const validProfessor = await Professor.create({
    userId: validProfessorUser.id,
    department: 'Software Engineering',
  });

  const validResult = await request('/api/v1/password-setup-token-store/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      setupToken: validSetupToken,
    }),
  });

  assert.equal(validResult.response.status, 200);
  assert.deepEqual(validResult.json, {
    valid: true,
    professorId: validProfessor.id,
    message: 'Setup token verified',
  });

  const expiredSetupToken = 'pst_expired_token';
  const expiredProfessorUser = await User.create({
    email: 'expired-prof@example.edu',
    fullName: 'Expired Professor',
    role: 'PROFESSOR',
    status: 'PASSWORD_SETUP_REQUIRED',
    passwordSetupTokenHash: professorService.hashToken(expiredSetupToken),
    passwordSetupTokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
  });

  await Professor.create({
    userId: expiredProfessorUser.id,
    department: 'Software Engineering',
  });

  const expiredResult = await request('/api/v1/password-setup-token-store/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      setupToken: expiredSetupToken,
    }),
  });

  assert.equal(expiredResult.response.status, 200);
  assert.deepEqual(expiredResult.json, {
    valid: false,
    message: 'Setup token is invalid, expired, or already used',
  });

  const usedSetupToken = 'pst_used_token';
  const usedProfessorUser = await User.create({
    email: 'used-prof@example.edu',
    fullName: 'Used Professor',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    passwordSetupTokenHash: professorService.hashToken(usedSetupToken),
    passwordSetupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
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
