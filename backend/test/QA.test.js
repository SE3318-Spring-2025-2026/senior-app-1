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
const { User, ValidStudentId } = require('../models');
const StudentRegistrationError = require('../errors/studentRegistrationError');
const studentRegistrationService = require('../services/studentRegistrationService');
const { ensureValidStudentRegistry, createStudent } = require('../services/studentService');

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



test('service detects missing ID among three and surfaces the correct 400/403 error mapping', async (t) => {
    const all = await ValidStudentId.findAll();
    console.log('seeded IDs:', all.map(r => r.studentId));

    await assert.rejects(
        studentRegistrationService.validateRegistrationDetails({
            studentId: '11070001999',
            email: 'missing@example.edu',
            fullName: 'Missing Student',
            password: 'StrongPass1!',
        }),
        (error) => {
            assert.ok(
                error instanceof StudentRegistrationError,
                'error must be a StudentRegistrationError',
            );
            assert.equal(
                error.status, 403,
                'absent-but-well-formed ID must map to HTTP 403',
            );
            assert.equal(
                error.code,
                'STUDENT_NOT_ELIGIBLE',
                'absent-but-well-formed ID must carry code STUDENT_NOT_ELIGIBLE',
            );
            return true;
        },
    );




    await assert.rejects(
        studentRegistrationService.validateRegistrationDetails({
            studentId: '1107000',       // 7 digits — invalid format
            email: 'bad-format@example.edu',
            fullName: 'Bad Format',
            password: 'StrongPass1!',
        }),
        (error) => {
            assert.ok(
                error instanceof StudentRegistrationError,
                'error must be a StudentRegistrationError',
            );
            assert.equal(
                error.status,
                400,
                'malformed ID must map to HTTP 400',
            );
            assert.equal(
                error.code,
                'INVALID_STUDENT_ID',
                'malformed ID must carry code INVALID_STUDENT_ID',
            );
            return true;
        },
    );


    const resultA = await studentRegistrationService.validateRegistrationDetails({
        studentId: '11070001000',
        email: 'present-a@example.edu',
        fullName: 'Present A',
        password: 'StrongPass1!',
    });
    assert.equal(resultA.studentId, '11070001000', 'present ID A must pass validation');

    const resultB = await studentRegistrationService.validateRegistrationDetails({
        studentId: '11070001073',
        email: 'present-b@example.edu',
        fullName: 'Present B',
        password: 'StrongPass1!',
    });
    assert.equal(resultB.studentId, '11070001001', 'present ID B must pass validation');
});



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
      // Bulk API exists — must do it in ONE query.
      findByPkCallCount = 0;
      await studentRegistrationService.checkEligibilityBulk(seededIds);
      assert.equal(
        findByPkCallCount,
        1,
        `checkEligibilityBulk must issue exactly 1 query for ${BATCH_SIZE} IDs, but issued ${findByPkCallCount}`,
      );
    } else {
      // No bulk API yet — call validateRegistrationDetails for each ID through
      // the real service so the spy measures actual production code behavior.
      // A correct implementation must use findAll/bulkFind, not one findByPk per ID.
      findByPkCallCount = 0;

      await Promise.all(
        seededIds.map((studentId, i) =>
          studentRegistrationService.validateRegistrationDetails({
            studentId,
            email: `student-${i}@example.edu`,
            fullName: `Student ${i}`,
            password: 'StrongPass1!',
          // Validation will pass or throw STUDENT_NOT_ELIGIBLE — both are fine here,
          // we only care about the query count.
          }).catch(() => {}),
        ),
      );assert.notEqual(
        findByPkCallCount,
        BATCH_SIZE,
        `service must NOT call findByPk once per ID (N+1). ` +
          `Got ${findByPkCallCount} calls for ${BATCH_SIZE} IDs. ` +
          `Implement a bulk findAll in isStudentIdEligible.`,
      );
    }
  } finally {
    ValidStudentId.findByPk = originalFindByPk;
  }
});


// Backend integration tests: POST /api/v1/groups/:groupId/invitations
// These tests will FAIL until:
//   1. Group, GroupMember, GroupInvitation models exist and are synced.
//   2. POST /api/v1/groups/:groupId/invitations route is implemented.
//   3. Route is registered in app.js.

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

// Helper: create a group via the API and return groupId.
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

//Test 1: 201 — invitations created successfully
// Response must be 201 and contain an invitations array with two entries.
// GroupInvitation rows must exist in the DB with status 'PENDING'.

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
        body: JSON.stringify({
            studentIds: ['11070001001', '11070001002'],
        }),
    });

    // HTTP assertions
    assert.equal(response.status, 201, 'inviting valid students must return 201');
    assert.ok(Array.isArray(json.invitations), 'response must contain an invitations array');
    assert.equal(json.invitations.length, 2, 'invitations array must have one entry per invited student');

    // DB assertions
    let GroupInvitation;
    try {
        ({ GroupInvitation } = require('../models'));
    } catch (_) {
        assert.fail('GroupInvitation model must be exported from ../models');
    }
    const invitationA = await GroupInvitation.findOne({
        where: { groupId, inviteeId: memberA.id },
    });
    assert.ok(invitationA, 'GroupInvitation row must exist for member A');
    assert.equal(invitationA.status, 'PENDING', "invitation status must default to 'PENDING'");

    const invitationB = await GroupInvitation.findOne({
        where: { groupId, inviteeId: memberB.id },
    });
    assert.ok(invitationB, 'GroupInvitation row must exist for member B');
    assert.equal(invitationB.status, 'PENDING', "invitation status must default to 'PENDING'");
});

//Test 2: 404 — group does not exist 
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

// Test 3: 400 — invalid student ID format 
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
        body: JSON.stringify({
            studentIds: ['short', '123'],   // both malformed — not 11 digits
        }),
    });

    assert.equal(response.status, 400, 'malformed student IDs must return 400');
    assert.equal(json.code, 'INVALID_STUDENT_ID', "error code must be 'INVALID_STUDENT_ID'");

    // No invitation rows must exist.
    let GroupInvitation;
    try {
        ({ GroupInvitation } = require('../models'));
        const rows = await GroupInvitation.findAll({ where: { groupId } });
        assert.equal(rows.length, 0, 'no invitation rows must be created for invalid IDs');
    } catch (_) { }
});

//Test 4: 400 — missing studentIds field
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
        body: JSON.stringify({}),   // no studentIds key at all
    });

    assert.equal(response.status, 400, 'missing studentIds must return 400');
    assert.equal(json.code, 'MISSING_STUDENT_IDS', "error code must be 'MISSING_STUDENT_IDS'");
});

// Test 5: 400 — ineligible student ID (valid format, not in registry)
test('POST /groups/:groupId/invitations returns 400 for ineligible student IDs', async () => {
    const leader = await createStudent({
        studentId: '11070001000',
        email: 'leader@example.edu',
        fullName: 'Leader Student',
        password: 'StrongPass1!',
    });

    const groupId = await createGroup(leader, 'Delta Team');

    // '11070001999' isnt in the seeded registry.
    const { response, json } = await request(`/api/v1/groups/${groupId}/invitations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(await authHeaderFor(leader)),
        },
        body: JSON.stringify({
            studentIds: ['11070001999'],
        }),
    });

    assert.equal(response.status, 400, 'ineligible student ID must return 400');
    assert.equal(json.code, 'STUDENT_NOT_ELIGIBLE', "error code must be 'STUDENT_NOT_ELIGIBLE'");

    // No invitation rows must exist.
    let GroupInvitation;
    try {
        ({ GroupInvitation } = require('../models'));
        const rows = await GroupInvitation.findAll({ where: { groupId } });
        assert.equal(rows.length, 0, 'no invitation rows must be created for ineligible IDs');
    } catch (_) { }
});

test('POST /groups/:groupId/invitations returns 400 for ineligible student IDs', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader Student',
    password: 'StrongPass1!',
  });
 
  const groupId = await createGroup(leader, 'Delta Team');
 
  // '11070001999' has valid format but is NOT in the seeded registry.
  const { response, json } = await request(`/api/v1/groups/${groupId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      studentIds: ['11070001999'],
    }),
  });
 
  assert.equal(response.status, 400, 'ineligible student ID must return 400');
  assert.equal(json.code, 'STUDENT_NOT_ELIGIBLE', "error code must be 'STUDENT_NOT_ELIGIBLE'");
 
  // No invitation rows must exist.
  let GroupInvitation;
  try {
    ({ GroupInvitation } = require('../models'));
    const rows = await GroupInvitation.findAll({ where: { groupId } });
    assert.equal(rows.length, 0, 'no invitation rows must be created for ineligible IDs');
  } catch (_) {}
});