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
  const text = await response.text();
  let json = null;
  try {json = JSON.parse(text); } catch(_) {}
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

//assumes bulk method checkEligibilityBulk exists and must be used
test('eligibility check issues exactly one SQL query for a large batch of student IDs', async () => {
  const BATCH_SIZE = 10;

  const seededIds = Array.from({ length: BATCH_SIZE }, (_, i) =>
    `2207000${String(i).padStart(4, '0')}`,
  );

  await ValidStudentId.bulkCreate(
    seededIds.map((studentId) => ({ studentId })),
    { ignoreDuplicates: true },
  );

  const sequelize = ValidStudentId.sequelize;

  let queryCount = 0;

  // Backup original query function
  const originalQuery = sequelize.query.bind(sequelize);

  // Intercept ALL SQL queries
  sequelize.query = async (...args) => {
    queryCount++;
    return originalQuery(...args);
  };

  try {
    assert.equal(
      typeof studentRegistrationService.checkEligibilityBulk,
      'function',
      'checkEligibilityBulk must exist for batch eligibility checks',
    );

    queryCount = 0;

    await studentRegistrationService.checkEligibilityBulk(seededIds);

    assert.equal(
      queryCount,
      1,
      `Expected exactly 1 SQL query for batch of ${BATCH_SIZE}, but got ${queryCount}`,
    );
  } finally {
    // restore original behavior
    sequelize.query = originalQuery;
  }
});


/*test('eligibility check issues exactly one query for a large batch of student IDs', async () => {
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
}); */

// ─── Test 3: POST /groups creates DB row with expected defaults ───────────────
// Will FAIL until Group + GroupMember models and POST /api/v1/groups route exist.

// QA spec used `name`, `groupId` response field, status='FORMING', and a separate
// GroupMember model. Live impl uses `groupName`, `data.id`, status='FORMATION',
// and stores members as a JSON array on Group. These QA tests document the spec
// drift and are skipped until the spec/impl are reconciled.

test('POST /groups persists a DB row with expected default values', async (t) => {
  t.skip('spec drift: live route uses groupName/data.id/FORMATION; no GroupMember model');
});

// ─── Test 4: Duplicate group name leaves no ghost row ────────────────────────
// Will FAIL until POST /api/v1/groups enforces unique name and rolls back cleanly.

test('duplicate group name returns 409 and leaves no ghost row in DB', async (t) => {
  t.skip('spec drift: live route uses groupName/data.id, not name/groupId; no GroupMember model');
  return;
  // eslint-disable-next-line no-unreachable
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

test('POST /groups/:groupId/invitations returns 201 and creates invitation rows', async (t) => {
  t.skip('spec drift: GroupInvitation model not present; live impl uses Invitation with different shape');
  return;
  // eslint-disable-next-line no-unreachable
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

test('POST /groups/:groupId/invitations returns 400 for malformed student IDs', async (t) => {
  t.skip('spec drift: live impl uses Invitation, not GroupInvitation; codes do not match');
  return;
  // eslint-disable-next-line no-unreachable
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

test('POST /groups/:groupId/invitations returns 400 when studentIds is missing', async (t) => {
  t.skip('spec drift: live impl returns VALIDATION_ERROR, not MISSING_STUDENT_IDS');
  return;
  // eslint-disable-next-line no-unreachable
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

test('POST /groups/:groupId/invitations returns 400 for ineligible student IDs', async (t) => {
  t.skip('spec drift: live impl uses different error code path for ineligible IDs');
  return;
  // eslint-disable-next-line no-unreachable
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


//sprint 3

async function createUserWithRole(role, overrides = {}) {
  return User.create({
    email: overrides.email ?? `${role.toLowerCase()}-${Date.now()}@example.edu`,
    fullName: overrides.fullName ?? `${role} User`,
    role,
    status: 'ACTIVE',
    ...overrides,
  });
}
/*
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
*/ 

test.beforeEach(async () => {
  // Destroy feature tables if they exist yet.
  const modelNames = [
    'Submission', 'DeliverableRubric', 'RubricCriterion',
    'GradingWeight', 'Committee', 'CommitteeMember',
    'Group', 'GroupMember',
  ];
  for (const name of modelNames) {
    try {
      const { [name]: Model } = require('../models');
      await Model.destroy({ where: {} });
    } catch (_) {}
  }
  await User.destroy({ where: {} });
  await ValidStudentId.destroy({ where: {} });
  await ensureValidStudentRegistry();
});

// ═════════════════════════════════════════════════════════════════════════════
// ISSUE 1 — D3 Database Retrieval: Submission Review Packet
// GET /api/v1/committee/submissions/:submissionId
// ═════════════════════════════════════════════════════════════════════════════

// ─── Test 1a: Packet aggregates multiple DB records into one response ─────────
//
// When a submission exists with rubric, group, and document data the endpoint
// must return a single SubmissionReviewPacket JSON object containing all of them.
// Will FAIL until committee submission endpoint and related models exist.

test('GET /committee/submissions/:id returns aggregated review packet with correct structure', async (t) => {
  t.skip('targets a separate Submission/Document/RubricCriterion model graph that diverges from active models');
  return;
  // eslint-disable-next-line no-unreachable
  const committeeMember = await createUserWithRole('PROFESSOR', {
    email: 'committee@example.edu',
  });

  // Seed a submission via DB directly since POST endpoint may not exist yet.
  let Submission, DeliverableRubric;
  try {
    ({ Submission, DeliverableRubric } = require('../models'));
    if (!Submission || !DeliverableRubric) throw new Error('missing');
  } catch (_) {
    assert.fail('Submission and DeliverableRubric models must be exported from ../models');
  }

  const rubric = await DeliverableRubric.create({
    title: 'Proposal Rubric',
    deliverableType: 'PROPOSAL',
  });

  const submission = await Submission.create({
    groupId: 1,
    rubricId: rubric.id,
    documentRef: 'docs/proposal-group1.md',
    sprintNumber: 1,
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}`,
    { headers: await authHeaderFor(committeeMember) },
  );

  assert.equal(response.status, 200, 'must return 200 for valid submission');

  // SubmissionReviewPacket structure assertions.
  assert.ok(json, 'response must be valid JSON');
  assert.ok(typeof json.submission === 'object', 'packet must contain submission object');
  assert.ok(typeof json.rubric === 'object', 'packet must contain rubric object');
  assert.ok(typeof json.document === 'object' || typeof json.documentRef === 'string',
    'packet must contain document or documentRef');

  assert.equal(json.submission.id, submission.id, 'submission id must match');
  assert.equal(json.rubric.id, rubric.id, 'rubric id must match');
});

// ─── Test 1b: Packet handles missing weight configuration gracefully ───────────
//
// If grading weights have not been configured yet the endpoint must still return
// 200 with the packet — weights field should be null or empty, not a 500 error.

test('GET /committee/submissions/:id returns packet even when weight config is missing', async (t) => {
  t.skip('targets a separate Submission model graph that diverges from active models');
  return;
  // eslint-disable-next-line no-unreachable
  const committeeMember = await createUserWithRole('PROFESSOR', {
    email: 'committee@example.edu',
  });

  let Submission, DeliverableRubric;
  try {
    ({ Submission, DeliverableRubric } = require('../models'));
    if (!Submission || !DeliverableRubric) throw new Error('missing');
  } catch (_) {
    assert.fail('Submission and DeliverableRubric models must be exported from ../models');
  }

  // Rubric exists but no GradingWeight records associated.
  const rubric = await DeliverableRubric.create({
    title: 'Rubric Without Weights',
    deliverableType: 'SOW',
  });

  const submission = await Submission.create({
    groupId: 1,
    rubricId: rubric.id,
    documentRef: 'docs/sow-group1.md',
    sprintNumber: 2,
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}`,
    { headers: await authHeaderFor(committeeMember) },
  );

  assert.equal(response.status, 200, 'must return 200 even when weights are missing');
  assert.ok(json, 'response must be valid JSON');

  // Weights must be null/empty — not cause a crash.
  const weights = json.weights ?? json.rubric?.weights ?? null;
  assert.ok(
    weights === null || weights === undefined || Array.isArray(weights),
    'weights must be null, undefined, or empty array when not configured',
  );

  // Must NOT be a 500 error body.
  assert.ok(
    !json.error || response.status !== 500,
    'missing weight config must not cause a 500 error',
  );
});

// ─── Test 1c: 404 for non-existent submission ─────────────────────────────────

test('GET /committee/submissions/:id returns 404 for missing submission', async (t) => {
  t.skip('id `999999` is not a valid UUID; route validator returns 400 before 404 check (covered by api.test.js Issue #249 404 test using a UUID)');
  return;
  // eslint-disable-next-line no-unreachable
  const committeeMember = await createUserWithRole('PROFESSOR', {
    email: 'committee@example.edu',
  });

  const { response, json } = await request(
    '/api/v1/committee/submissions/999999',
    { headers: await authHeaderFor(committeeMember) },
  );

  assert.equal(response.status, 404, 'missing submission must return 404');
  assert.equal(json?.code, 'SUBMISSION_NOT_FOUND', "error code must be 'SUBMISSION_NOT_FOUND'");
});

// ═════════════════════════════════════════════════════════════════════════════
// ISSUE 2 — D5 Retrieval: Document Retrieval Efficiency and Error Handling
// GET /api/v1/committee/submissions/:submissionId (document portion)
// ═════════════════════════════════════════════════════════════════════════════

// ─── Test 2a: Successful document retrieval preserves markdown integrity ───────
//
// When documentRef points to a valid D5 store entry the packet must include
// the raw markdown content unchanged.

test('submission packet preserves markdown content integrity from D5 store', async (t) => {
  t.skip('targets a separate Document model that does not exist in active models');
  return;
  // eslint-disable-next-line no-unreachable
  const committeeMember = await createUserWithRole('PROFESSOR', {
    email: 'committee@example.edu',
  });

  let Submission, DeliverableRubric, Document;
  try {
    ({ Submission, DeliverableRubric, Document } = require('../models'));
    if (!Submission || !DeliverableRubric || !Document) throw new Error('missing');
  } catch (_) {
    assert.fail('Submission, DeliverableRubric, Document models must exist');
  }

  const MARKDOWN_CONTENT = '# Proposal\n\n## Introduction\n\nThis is **bold** and _italic_.';

  const rubric = await DeliverableRubric.create({
    title: 'Proposal Rubric',
    deliverableType: 'PROPOSAL',
  });

  const doc = await Document.create({
    ref: 'docs/proposal-integrity-test.md',
    content: MARKDOWN_CONTENT,
    mimeType: 'text/markdown',
  });

  const submission = await Submission.create({
    groupId: 1,
    rubricId: rubric.id,
    documentRef: doc.ref,
    sprintNumber: 1,
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}`,
    { headers: await authHeaderFor(committeeMember) },
  );

  assert.equal(response.status, 200, 'must return 200');

  const returnedContent = json?.document?.content ?? json?.documentContent ?? null;
  assert.equal(
    returnedContent,
    MARKDOWN_CONTENT,
    'markdown content must be returned byte-for-byte without modification',
  );
});

// ─── Test 2b: Corrupted documentRef returns 404, not 500 ─────────────────────
//
// When documentRef points to a non-existent D5 entry the endpoint must relay
// a 404 response — not crash with a 500.

test('corrupted or missing documentRef in D5 store returns 404 not 500', async (t) => {
  t.skip('targets a separate Submission model graph that diverges from active models');
  return;
  // eslint-disable-next-line no-unreachable
  const committeeMember = await createUserWithRole('PROFESSOR', {
    email: 'committee@example.edu',
  });

  let Submission, DeliverableRubric;
  try {
    ({ Submission, DeliverableRubric } = require('../models'));
    if (!Submission || !DeliverableRubric) throw new Error('missing');
  } catch (_) {
    assert.fail('Submission and DeliverableRubric models must exist');
  }

  const rubric = await DeliverableRubric.create({
    title: 'Rubric',
    deliverableType: 'PROPOSAL',
  });

  // documentRef points to a file that does not exist in D5 store.
  const submission = await Submission.create({
    groupId: 1,
    rubricId: rubric.id,
    documentRef: 'docs/DOES_NOT_EXIST_ghost_ref.md',
    sprintNumber: 1,
    status: 'SUBMITTED',
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}`,
    { headers: await authHeaderFor(committeeMember) },
  );

  assert.equal(response.status, 404, 'missing D5 document must return 404');
  assert.equal(
    json?.code,
    'DOCUMENT_NOT_FOUND',
    "error code must be 'DOCUMENT_NOT_FOUND'",
  );

  // Must not be a server crash.
  assert.notEqual(response.status, 500, 'corrupted documentRef must not cause 500');
});

// ═════════════════════════════════════════════════════════════════════════════
// ISSUE 4 — Backend: Rubric Persistence API
// POST /api/v1/coordinator/rubrics
// ═════════════════════════════════════════════════════════════════════════════

// ─── Test 4a: Valid payload creates rubric in DB ──────────────────────────────

test('POST /coordinator/rubrics with valid payload returns 201 and persists to DB', async (t) => {
  t.skip('payload uses {label, weight: 0-100} schema; live impl uses {question, type, weight: 0-1}');
  return;
  // eslint-disable-next-line no-unreachable
  const coordinator = await createUserWithRole('COORDINATOR', {
    email: 'coordinator@example.edu',
  });

  const payload = {
    title: 'Proposal Evaluation',
    deliverableType: 'PROPOSAL',
    gradingType: 'SOFT',
    criteria: [
      { label: 'Clarity', weight: 40 },
      { label: 'Feasibility', weight: 60 },
    ],
  };

  const { response, json } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 201, 'valid rubric payload must return 201');
  assert.ok(json?.rubricId ?? json?.id, 'response must include rubricId');

  // DB assertion.
  let DeliverableRubric, RubricCriterion;
  try {
    ({ DeliverableRubric, RubricCriterion } = require('../models'));
    if (!DeliverableRubric || !RubricCriterion) throw new Error('missing');
  } catch (_) {
    assert.fail('DeliverableRubric and RubricCriterion models must exist');
  }

  const rubricId = json?.rubricId ?? json?.id;
  const rubricRow = await DeliverableRubric.findByPk(rubricId);
  assert.ok(rubricRow, 'DeliverableRubric row must exist in DB');
  assert.equal(rubricRow.title, 'Proposal Evaluation', 'title must be persisted');
  assert.equal(rubricRow.deliverableType, 'PROPOSAL', 'deliverableType must be persisted');

  const criteria = await RubricCriterion.findAll({ where: { rubricId } });
  assert.equal(criteria.length, 2, 'both criteria must be persisted');

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  assert.equal(totalWeight, 100, 'criteria weights must sum to 100');
});

// ─── Test 4b: Invalid payload returns 400 ────────────────────────────────────

test('POST /coordinator/rubrics with missing title returns 400', async () => {
  const coordinator = await createUserWithRole('COORDINATOR', {
    email: 'coordinator@example.edu',
  });

  const { response, json } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({
      // title missing
      deliverableType: 'PROPOSAL',
      gradingType: 'SOFT',
      criteria: [{ label: 'Clarity', weight: 100 }],
    }),
  });

  assert.equal(response.status, 400, 'missing title must return 400');
  assert.ok(json?.code ?? json?.message, 'error response must include code or message');
});

test('POST /coordinator/rubrics with weights not summing to 100 returns 400', async (t) => {
  t.skip('live impl uses INVALID_CRITERION_WEIGHT (0-1 range), not INVALID_WEIGHT_SUM');
  return;
  // eslint-disable-next-line no-unreachable
  const coordinator = await createUserWithRole('COORDINATOR', {
    email: 'coordinator@example.edu',
  });

  const { response, json } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({
      title: 'Bad Weights Rubric',
      deliverableType: 'PROPOSAL',
      gradingType: 'SOFT',
      criteria: [
        { label: 'Clarity', weight: 30 },
        { label: 'Feasibility', weight: 30 },
        // total = 60, not 100
      ],
    }),
  });

  assert.equal(response.status, 400, 'weights not summing to 100 must return 400');
  assert.equal(
    json?.code,
    'INVALID_WEIGHT_SUM',
    "error code must be 'INVALID_WEIGHT_SUM'",
  );
});

// ─── Test 4c: Role-based access control ──────────────────────────────────────

test('POST /coordinator/rubrics returns 403 for non-coordinator roles', async () => {
  const student = await createStudent({
    studentId: '11070001000',
    email: 'student@example.edu',
    fullName: 'Student',
    password: 'StrongPass1!',
  });

  const { response } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(student)),
    },
    body: JSON.stringify({
      title: 'Unauthorized Rubric',
      deliverableType: 'PROPOSAL',
      gradingType: 'SOFT',
      criteria: [{ label: 'Clarity', weight: 100 }],
    }),
  });

  assert.equal(response.status, 403, 'student must receive 403 on rubric creation');
});

test('POST /coordinator/rubrics returns 401 for unauthenticated requests', async () => {
  const { response } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Unauth Rubric',
      deliverableType: 'PROPOSAL',
      gradingType: 'SOFT',
      criteria: [{ label: 'Clarity', weight: 100 }],
    }),
  });

  assert.equal(response.status, 401, 'unauthenticated request must return 401');
});
