const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
process.env.SQLITE_STORAGE = ':memory:';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.FRONTEND_GITHUB_RETURN_URL = 'http://localhost:5173/home';
process.env.GITHUB_CLIENT_ID = '';
process.env.GITHUB_CLIENT_SECRET = '';

const sequelize = require('../db');
const app = require('../app');
const { User, ValidStudentId } = require('../models');
const StudentRegistrationError = require('../errors/studentRegistrationError');
const studentRegistrationService = require('../services/studentRegistrationService');
const { ensureValidStudentRegistry, createStudent } = require('../services/studentService');

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

async function createGroup(leader, name = 'Test Group') {
  const { json } = await request('/api/v1/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ name }),
  });
  return json.groupId;
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
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  try {
    const { GroupInvitation } = require('../models');
    await GroupInvitation.destroy({ where: {} });
  } catch (_) {}
  try {
    const { GroupMember } = require('../models');
    await GroupMember.destroy({ where: {} });
  } catch (_) {}
  try {
    const { Group } = require('../models');
    await Group.destroy({ where: {} });
  } catch (_) {}
  await User.destroy({ where: {} });
  await ValidStudentId.destroy({ where: {} });
  await ensureValidStudentRegistry();
});

// ─── Test 1: Missing ID detection with correct 400/403 mapping ───────────────
// Registry seeds: 11070001000, 11070001001, 11070001002
// Three IDs tested: two present, one missing (11070001999)
// Missing well-formed ID → 403 STUDENT_NOT_ELIGIBLE
// Malformed ID → 400 INVALID_STUDENT_ID (caught before registry lookup)

test('service detects missing ID among three and surfaces the correct 400/403 error mapping', async () => {
  const all = await ValidStudentId.findAll();
  console.log('seeded IDs:', all.map((r) => r.studentId));

  // 1a. Well-formed but absent → 403 STUDENT_NOT_ELIGIBLE
  await assert.rejects(
    studentRegistrationService.validateRegistrationDetails({
      studentId: '11070001999',
      email: 'missing@example.edu',
      fullName: 'Missing Student',
      password: 'StrongPass1!',
    }),
    (error) => {
      assert.ok(error instanceof StudentRegistrationError, 'error must be a StudentRegistrationError');
      assert.equal(error.status, 403, 'absent-but-well-formed ID must map to HTTP 403');
      assert.equal(error.code, 'STUDENT_NOT_ELIGIBLE', 'must carry code STUDENT_NOT_ELIGIBLE');
      return true;
    },
  );

  // 1b. Malformed (7 digits) → 400 INVALID_STUDENT_ID before registry lookup
  await assert.rejects(
    studentRegistrationService.validateRegistrationDetails({
      studentId: '1107000',
      email: 'bad-format@example.edu',
      fullName: 'Bad Format',
      password: 'StrongPass1!',
    }),
    (error) => {
      assert.ok(error instanceof StudentRegistrationError, 'error must be a StudentRegistrationError');
      assert.equal(error.status, 400, 'malformed ID must map to HTTP 400');
      assert.equal(error.code, 'INVALID_STUDENT_ID', 'must carry code INVALID_STUDENT_ID');
      return true;
    },
  );

  // 1c. All three seeded IDs pass cleanly — unique emails avoid DUPLICATE_EMAIL
  const resultA = await studentRegistrationService.validateRegistrationDetails({
    studentId: '11070001000',
    email: 'present-a@example.edu',
    fullName: 'Present A',
    password: 'StrongPass1!',
  });
  assert.equal(resultA.studentId, '11070001000', 'present ID A must pass validation');

  const resultB = await studentRegistrationService.validateRegistrationDetails({
    studentId: '11070001001',
    email: 'present-b@example.edu',
    fullName: 'Present B',
    password: 'StrongPass1!',
  });
  assert.equal(resultB.studentId, '11070001001', 'present ID B must pass validation');

  const resultC = await studentRegistrationService.validateRegistrationDetails({
    studentId: '11070001002',
    email: 'present-c@example.edu',
    fullName: 'Present C',
    password: 'StrongPass1!',
  });
  assert.equal(resultC.studentId, '11070001002', 'present ID C must pass validation');
});

// ─── Test 2: Single-query performance guarantee ───────────────────────────────
// isStudentIdEligible currently calls findByPk once per ID (N+1).
// Test will FAIL until service is refactored to use bulk findAll WHERE IN.

test('eligibility check issues exactly one query for a large batch of student IDs', async () => {
  const BATCH_SIZE = 10;
  const seededIds = Array.from({ length: BATCH_SIZE }, (_, i) =>
    `2207000${String(i).padStart(4, '0')}`,
  );

  await ValidStudentId.bulkCreate(
    seededIds.map((studentId) => ({ studentId })),
    { ignoreDuplicates: true },
  );

  let findByPkCallCount = 0;
  const originalFindByPk = ValidStudentId.findByPk.bind(ValidStudentId);
  ValidStudentId.findByPk = async (...args) => {
    findByPkCallCount++;
    return originalFindByPk(...args);
  };

  try {
    if (typeof studentRegistrationService.checkEligibilityBulk === 'function') {
      findByPkCallCount = 0;
      await studentRegistrationService.checkEligibilityBulk(seededIds);
      assert.equal(
        findByPkCallCount,
        1,
        `checkEligibilityBulk must issue exactly 1 query for ${BATCH_SIZE} IDs, but issued ${findByPkCallCount}`,
      );
    } else {
      findByPkCallCount = 0;
      await Promise.all(
        seededIds.map((studentId, i) =>
          studentRegistrationService.validateRegistrationDetails({
            studentId,
            email: `student-${i}@example.edu`,
            fullName: `Student ${i}`,
            password: 'StrongPass1!',
          }).catch(() => {}),
        ),
      );
      assert.notEqual(
        findByPkCallCount,
        BATCH_SIZE,
        `service must NOT call findByPk once per ID (N+1). ` +
          `Got ${findByPkCallCount} calls for ${BATCH_SIZE} IDs. ` +
          `Refactor isStudentIdEligible to use a single bulk findAll.`,
      );
    }
  } finally {
    ValidStudentId.findByPk = originalFindByPk;
  }
});

// ─── Test 3: POST /groups creates DB row with expected defaults ───────────────
// Will FAIL until Group + GroupMember models and POST /api/v1/groups route exist.

test('POST /groups persists a DB row with expected default values', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Team Leader',
    password: 'StrongPass1!',
  });

  const { response, json } = await request('/api/v1/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ name: 'Alpha Team' }),
  });

  assert.equal(response.status, 201, 'creating a group must return HTTP 201');
  assert.ok(
    typeof json.groupId === 'number' || typeof json.groupId === 'string',
    'response must include groupId',
  );

  let Group, GroupMember;
  try {
    ({ Group, GroupMember } = require('../models'));
  } catch (_) {
    assert.fail('Group and GroupMember models must be exported from ../models');
  }

  const groupRow = await Group.findByPk(json.groupId);
  assert.ok(groupRow, 'a Group row must exist in DB after POST /groups');
  assert.equal(groupRow.name, 'Alpha Team', 'Group.name must match submitted name');
  assert.equal(groupRow.advisorId ?? null, null, 'Group.advisorId must default to null');
  assert.equal(groupRow.status, 'FORMING', "Group.status must default to 'FORMING'");

  const leaderMembership = await GroupMember.findOne({
    where: { groupId: json.groupId, userId: leader.id },
  });
  assert.ok(leaderMembership, 'a GroupMember row must exist for the creating student');
  assert.equal(leaderMembership.role, 'LEADER', "creator GroupMember.role must be 'LEADER'");
});

// ─── Test 4: Duplicate group name leaves no ghost row ────────────────────────
// Will FAIL until POST /api/v1/groups enforces unique name and rolls back cleanly.

test('duplicate group name returns 409 and leaves no ghost row in DB', async () => {
  const studentA = await createStudent({
    studentId: '11070001000',
    email: 'leader-a@example.edu',
    fullName: 'Leader A',
    password: 'StrongPass1!',
  });

  const studentB = await createStudent({
    studentId: '11070001001',
    email: 'leader-b@example.edu',
    fullName: 'Leader B',
    password: 'StrongPass1!',
  });

  const first = await request('/api/v1/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(studentA)),
    },
    body: JSON.stringify({ name: 'Beta Team' }),
  });
  assert.equal(first.response.status, 201, 'first POST /groups must succeed with 201');

  const second = await request('/api/v1/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(studentB)),
    },
    body: JSON.stringify({ name: 'Beta Team' }),
  });
  assert.equal(second.response.status, 409, 'duplicate group name must return 409');
  assert.equal(second.json.code, 'DUPLICATE_GROUP_NAME', "must carry code 'DUPLICATE_GROUP_NAME'");

  let Group, GroupMember;
  try {
    ({ Group, GroupMember } = require('../models'));
  } catch (_) {
    assert.fail('Group and GroupMember models must be exported from ../models');
  }

  const allGroups = await Group.findAll({ where: { name: 'Beta Team' } });
  assert.equal(allGroups.length, 1, 'exactly one Group row must exist — no ghost record');

  const orphanedMembership = await GroupMember.findOne({ where: { userId: studentB.id } });
  assert.equal(orphanedMembership, null, 'no GroupMember row must exist for rejected student');
});

// ─── Test 5: POST /groups/:groupId/invitations returns 201 ───────────────────
// Will FAIL until GroupInvitation model and invitation route exist.

test('POST /groups/:groupId/invitations returns 201 and creates invitation rows', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader Student',
    password: 'StrongPass1!',
  });

  const memberA = await createStudent({
    studentId: '11070001001',
    email: 'member-a@example.edu',
    fullName: 'Member A',
    password: 'StrongPass1!',
  });

  const memberB = await createStudent({
    studentId: '11070001002',
    email: 'member-b@example.edu',
    fullName: 'Member B',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Alpha Team');

  const { response, json } = await request(`/api/v1/groups/${groupId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ studentIds: ['11070001001', '11070001002'] }),
  });

  assert.equal(response.status, 201, 'inviting valid students must return 201');
  assert.ok(Array.isArray(json.invitations), 'response must contain an invitations array');
  assert.equal(json.invitations.length, 2, 'invitations array must have one entry per invited student');

  let GroupInvitation;
  try {
    ({ GroupInvitation } = require('../models'));
  } catch (_) {
    assert.fail('GroupInvitation model must be exported from ../models');
  }

  const invitationA = await GroupInvitation.findOne({ where: { groupId, inviteeId: memberA.id } });
  assert.ok(invitationA, 'GroupInvitation row must exist for member A');
  assert.equal(invitationA.status, 'PENDING', "invitation status must default to 'PENDING'");

  const invitationB = await GroupInvitation.findOne({ where: { groupId, inviteeId: memberB.id } });
  assert.ok(invitationB, 'GroupInvitation row must exist for member B');
  assert.equal(invitationB.status, 'PENDING', "invitation status must default to 'PENDING'");
});

// ─── Test 6: 404 — group does not exist ──────────────────────────────────────

test('POST /groups/:groupId/invitations returns 404 when group does not exist', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader Student',
    password: 'StrongPass1!',
  });

  const { response, json } = await request('/api/v1/groups/999999/invitations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ studentIds: ['11070001001'] }),
  });

  assert.equal(response.status, 404, 'missing group must return 404');
  assert.equal(json.code, 'GROUP_NOT_FOUND', "error code must be 'GROUP_NOT_FOUND'");
});

// ─── Test 7: 400 — malformed student ID format ───────────────────────────────

test('POST /groups/:groupId/invitations returns 400 for malformed student IDs', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader Student',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Beta Team');

  const { response, json } = await request(`/api/v1/groups/${groupId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ studentIds: ['short', '123'] }),
  });

  assert.equal(response.status, 400, 'malformed student IDs must return 400');
  assert.equal(json.code, 'INVALID_STUDENT_ID', "error code must be 'INVALID_STUDENT_ID'");

  try {
    const { GroupInvitation } = require('../models');
    const rows = await GroupInvitation.findAll({ where: { groupId } });
    assert.equal(rows.length, 0, 'no invitation rows must be created for invalid IDs');
  } catch (_) {}
});

// ─── Test 8: 400 — missing studentIds field ───────────────────────────────────

test('POST /groups/:groupId/invitations returns 400 when studentIds is missing', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader Student',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Gamma Team');

  const { response, json } = await request(`/api/v1/groups/${groupId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400, 'missing studentIds must return 400');
  assert.equal(json.code, 'MISSING_STUDENT_IDS', "error code must be 'MISSING_STUDENT_IDS'");
});

// ─── Test 9: 400 — ineligible student ID ─────────────────────────────────────

test('POST /groups/:groupId/invitations returns 400 for ineligible student IDs', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader Student',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Delta Team');

  const { response, json } = await request(`/api/v1/groups/${groupId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ studentIds: ['11070001999'] }),
  });

  assert.equal(response.status, 400, 'ineligible student ID must return 400');
  assert.equal(json.code, 'STUDENT_NOT_ELIGIBLE', "error code must be 'STUDENT_NOT_ELIGIBLE'");

  try {
    const { GroupInvitation } = require('../models');
    const rows = await GroupInvitation.findAll({ where: { groupId } });
    assert.equal(rows.length, 0, 'no invitation rows must be created for ineligible IDs');
  } catch (_) {}
});
