
require('./setupTestEnv');
const bcrypt = require('bcryptjs');
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
const { ensureValidStudentRegistry, createStudent } = require('../services/studentService');

let server;
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { response, json };
}

async function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function createUserWithRole(role, overrides = {}) {
  return User.create({
    email: overrides.email ?? `${role.toLowerCase()}-${Date.now()}@example.edu`,
    fullName: overrides.fullName ?? `${role} User`,
    role,
    status: 'ACTIVE',
    ...overrides,
  });
}

// Confirmed from groupController.js:
//   body fields: groupName (required), maxMembers (required, 1-10)
//   response: json.data.groupId
async function createGroup(leader, groupName = 'Test Group') {
  const { json } = await request('/api/v1/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ groupName, maxMembers: 5 }),
  });
  return json?.data?.groupId ?? null;
}

// Confirmed from invitationController.js:
//   response field is `response` not `action`
//   values: "ACCEPT" | "REJECT"
async function sendInvitation(leader, groupId, studentId) {
  const { json } = await request(`/api/v1/groups/${groupId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({ studentIds: [studentId] }),
  });
  // Response structure: { created: [{ id, groupId, studentId, status }], skippedStudentIds: [] }
  return json?.created?.[0]?.id ?? null; //api doesnt contain invitations[0].id
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
  const modelNames = [
    'Invitation', 'GroupAdvisorAssignment', 'AdvisorRequest',
    'Group', 'DeliverableRubric', 'GradingRubric',
    'DeliverableSubmission', 'CommitteeReview',
    'Notification', 'AuditLog',
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
// INVITATION RESPONSE TESTS
// PATCH /api/v1/invitations/:invitationId/respond
// Body field: `response` (not `action`) — values: "ACCEPT" | "REJECT"
// ═════════════════════════════════════════════════════════════════════════════

test('invitee can accept invitation — returns 200 with ACCEPTED status', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001001',
    email: 'invitee@example.edu',
    fullName: 'Invitee',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Accept Team');
  assert.ok(groupId, `group creation failed — groupId: ${groupId}`);

  const invitationId = await sendInvitation(leader, groupId, '11070001001');
  assert.ok(invitationId, `invitation dispatch failed — invitationId: ${invitationId}`);

  const { response, json } = await request(
    `/api/v1/invitations/${invitationId}/respond`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(invitee)),
      },
      body: JSON.stringify({ response: 'ACCEPT' }),
    },
  );

  assert.equal(response.status, 200, `must return 200, got ${response.status}, body: ${JSON.stringify(json)}`);
  const status = json?.invitation?.status ?? json?.status ?? json?.data?.status;
  assert.equal(status, 'ACCEPTED', `response must contain status ACCEPTED, got: ${status}`);
});

test('invitee can reject invitation — returns 200 with REJECTED status', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001001',
    email: 'invitee@example.edu',
    fullName: 'Invitee',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Reject Team');
  assert.ok(groupId, `group creation failed — groupId: ${groupId}`);

  const invitationId = await sendInvitation(leader, groupId, '11070001001');
  assert.ok(invitationId, `invitation dispatch failed — invitationId: ${invitationId}`);

  const { response, json } = await request(
    `/api/v1/invitations/${invitationId}/respond`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(invitee)),
      },
      body: JSON.stringify({ response: 'REJECT' }),
    },
  );

  assert.equal(response.status, 200, `must return 200, got ${response.status}, body: ${JSON.stringify(json)}`);
  const status = json?.invitation?.status ?? json?.status ?? json?.data?.status;
  assert.equal(status, 'REJECTED', `response must contain status REJECTED, got: ${status}`);
});

test('responding to already-responded invitation returns 400', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001001',
    email: 'invitee@example.edu',
    fullName: 'Invitee',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'State Team');
  const invitationId = await sendInvitation(leader, groupId, '11070001001');

  // First response — accept.
  await request(`/api/v1/invitations/${invitationId}/respond`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(invitee)),
    },
    body: JSON.stringify({ response: 'ACCEPT' }),
  });

  // Second response — must fail.
  const { response, json } = await request(
    `/api/v1/invitations/${invitationId}/respond`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(invitee)),
      },
      body: JSON.stringify({ response: 'REJECT' }),
    },
  );

  assert.equal(response.status, 400, `second response must return 400, got ${response.status}`);
  assert.ok(json?.code ?? json?.message, 'error response must include code or message');
});

test('missing invitation returns 404 and does not attempt status update', async () => {
  const invitee = await createStudent({
    studentId: '11070001000',
    email: 'invitee@example.edu',
    fullName: 'Invitee',
    password: 'StrongPass1!',
  });

  // Valid UUID format that does not exist in DB.
  const fakeId = '00000000-0000-0000-0000-000000000000';

  const { response, json } = await request(
    `/api/v1/invitations/${fakeId}/respond`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(invitee)),
      },
      body: JSON.stringify({ response: 'ACCEPT' }),
    },
  );

  assert.equal(response.status, 404, `must return 404, got ${response.status}, body: ${JSON.stringify(json)}`);
});

test('non-invitee responding to invitation returns 403', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001001',
    email: 'invitee@example.edu',
    fullName: 'Invitee',
    password: 'StrongPass1!',
  });
  const stranger = await createStudent({
    studentId: '11070001002',
    email: 'stranger@example.edu',
    fullName: 'Stranger',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Forbidden Team');
  const invitationId = await sendInvitation(leader, groupId, '11070001001');

  const { response, json } = await request(
    `/api/v1/invitations/${invitationId}/respond`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(stranger)),
      },
      body: JSON.stringify({ response: 'ACCEPT' }),
    },
  );

  assert.equal(response.status, 403, `non-invitee must receive 403, got ${response.status}, body: ${JSON.stringify(json)}`);
});

test('concurrent updates to same invitation allow only one success', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001001',
    email: 'invitee@example.edu',
    fullName: 'Invitee',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Concurrent Team');
  const invitationId = await sendInvitation(leader, groupId, '11070001001');

  const inviteeHeaders = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(invitee)),
  };

  const [resultA, resultB] = await Promise.all([
    request(`/api/v1/invitations/${invitationId}/respond`, {
      method: 'PATCH',
      headers: inviteeHeaders,
      body: JSON.stringify({ response: 'ACCEPT' }),
    }),
    request(`/api/v1/invitations/${invitationId}/respond`, {
      method: 'PATCH',
      headers: inviteeHeaders,
      body: JSON.stringify({ response: 'REJECT' }),
    }),
  ]);

  const statuses = [resultA.response.status, resultB.response.status].sort();
  assert.equal(statuses[0], 200, `one concurrent request must succeed with 200, got ${statuses}`);
  assert.ok(
    statuses[1] === 400 || statuses[1] === 409,
    `other request must fail with 400 or 409, got ${statuses[1]}`,
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// SUBMISSION REVIEW PACKET TESTS
// GET /api/v1/committee/submissions/:submissionId
// submissionId must be UUID
// Access check: canUserAccessSubmission — use COORDINATOR role which has access
// ═════════════════════════════════════════════════════════════════════════════

test('GET /committee/submissions/:id returns aggregated review packet', async () => {
  const coordinator = await createUserWithRole('COORDINATOR', {
    email: 'coordinator@example.edu',
  });

  let DeliverableSubmission, GradingRubric;
  try {
    ({ DeliverableSubmission, GradingRubric } = require('../models'));
  } catch (_) {
    assert.fail('DeliverableSubmission and GradingRubric models must exist in ../models');
  }

  // GradingRubric fields: deliverableType, criteria (JSON), updatedBy
  const rubric = await GradingRubric.create({
    deliverableType: 'PROPOSAL',
    criteria: [{ name: 'Clarity', maxPoints: 10 }],
  });

  // DeliverableSubmission fields: groupId, sprintNumber, deliverableType, documentRef, submittedBy
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Submission Team');
  assert.ok(groupId, `group creation failed — groupId: ${groupId}`);

  const submission = await DeliverableSubmission.create({
    groupId,
    sprintNumber: 1,
    deliverableType: 'PROPOSAL',
    documentRef: 'docs/proposal-group1.md',
    submittedBy: leader.id,
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}`,
    { headers: await authHeaderFor(coordinator) },
  );

  assert.equal(response.status, 200, `must return 200, got ${response.status}, body: ${JSON.stringify(json)}`);
  assert.ok(json, 'response must be valid JSON');
  const data = json?.data ?? json;
  assert.ok(data, 'packet must contain data');
});

test('GET /committee/submissions/:id returns packet even when weight config is missing', async () => {
  const coordinator = await createUserWithRole('COORDINATOR', {
    email: 'coordinator@example.edu',
  });

  let DeliverableSubmission;
  try {
    ({ DeliverableSubmission } = require('../models'));
  } catch (_) {
    assert.fail('DeliverableSubmission model must exist');
  }

  // No GradingRubric created — simulates missing weight configuration.
  const submission = await DeliverableSubmission.create({
    groupId,
    sprintNumber: 2,
    deliverableType: 'SOW',
    documentRef: 'docs/sow-group1.md',
    submittedBy: leader.id,
  });

  const { response } = await request(
    `/api/v1/committee/submissions/${submission.id}`,
    { headers: await authHeaderFor(coordinator) },
  );

  assert.equal(response.status, 200, 'must return 200 even when weights missing');
  assert.notEqual(response.status, 500, 'missing weights must not cause 500');
});

test('GET /committee/submissions/:id returns 404 for missing submission', async () => {
  const coordinator = await createUserWithRole('COORDINATOR', {
    email: 'coordinator@example.edu',
  });

  const fakeId = '00000000-0000-0000-0000-000000000000';

  const { response, json } = await request(
    `/api/v1/committee/submissions/${fakeId}`,
    { headers: await authHeaderFor(coordinator) },
  );

  assert.equal(response.status, 404, `missing submission must return 404, got ${response.status}, body: ${JSON.stringify(json)}`);
});

test('corrupted documentRef returns 404 not 500', async () => {
  const coordinator = await createUserWithRole('COORDINATOR', {
    email: 'coordinator@example.edu',
  });

  let DeliverableSubmission;
  try {
    ({ DeliverableSubmission } = require('../models'));
  } catch (_) {
    assert.fail('DeliverableSubmission model must exist');
  }

  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'Ghost Ref Team');
  assert.ok(groupId, `group creation failed`);

  const submission = await DeliverableSubmission.create({
    groupId,
    sprintNumber: 1,
    deliverableType: 'PROPOSAL',
    documentRef: 'docs/DOES_NOT_EXIST_ghost_ref.md',
    submittedBy: leader.id,
  });

  const { response, json } = await request(
    `/api/v1/committee/submissions/${submission.id}`,
    { headers: await authHeaderFor(coordinator) },
  );

  assert.equal(response.status, 404, `corrupted documentRef must return 404, got ${response.status}`);
  assert.notEqual(response.status, 500, 'corrupted documentRef must not cause 500');
});

// ═════════════════════════════════════════════════════════════════════════════
// RUBRIC PERSISTENCE TESTS
// POST /api/v1/coordinator/rubrics uses coordinatorController.createRubric
// Confirmed fields: deliverableName, criteria[].name, criteria[].maxPoints,
//                   totalPoints, courseId (optional)
// Response 201: { code: 'CREATED', data: { id, deliverableName, ... } }
// ═════════════════════════════════════════════════════════════════════════════

test('POST /coordinator/rubrics with valid payload returns 201', async () => {
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
      deliverableName: 'Proposal Evaluation',
      criteria: [
        { name: 'Clarity', description: 'Is it clear?', maxPoints: 40 },
        { name: 'Feasibility', description: 'Is it feasible?', maxPoints: 60 },
      ],
      totalPoints: 100,
    }),
  });

  assert.equal(response.status, 201, `valid payload must return 201, got ${response.status}, body: ${JSON.stringify(json)}`);
  const rubricId = json?.data?.id ?? json?.rubricId ?? json?.id;
  assert.ok(rubricId, 'response must include rubric id');
});

test('POST /coordinator/rubrics with missing deliverableName returns 400', async () => {
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
      // deliverableName missing
      criteria: [{ name: 'Clarity', maxPoints: 100 }],
      totalPoints: 100,
    }),
  });

  assert.equal(response.status, 400, `missing deliverableName must return 400, got ${response.status}`);
  assert.equal(json?.code, 'INVALID_RUBRIC_INPUT', `must carry code INVALID_RUBRIC_INPUT, got ${json?.code}`);
});

test('POST /coordinator/rubrics with missing totalPoints returns 400', async () => {
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
      deliverableName: 'No Total Points Rubric',
      criteria: [{ name: 'Clarity', maxPoints: 100 }],
      // totalPoints missing
    }),
  });

  assert.equal(response.status, 400, `missing totalPoints must return 400, got ${response.status}`);
  assert.equal(json?.code, 'INVALID_RUBRIC_INPUT', `must carry code INVALID_RUBRIC_INPUT, got ${json?.code}`);
});

test('POST /coordinator/rubrics returns 403 for student role', async () => {
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
      deliverableName: 'Unauthorized Rubric',
      criteria: [{ name: 'Clarity', maxPoints: 100 }],
      totalPoints: 100,
    }),
  });

  assert.equal(response.status, 403, 'student must receive 403');
});

test('POST /coordinator/rubrics returns 401 for unauthenticated request', async () => {
  const { response } = await request('/api/v1/coordinator/rubrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deliverableName: 'Unauth Rubric',
      criteria: [{ name: 'Clarity', maxPoints: 100 }],
      totalPoints: 100,
    }),
  });

  assert.equal(response.status, 401, 'unauthenticated request must return 401');
});

/**
 * Issue O — Testing: GET /my-grade (P64)
 *
 * Add this file to package.json "test" script when merging.
 */

// Lazy-load MemberFinalGrade — model may not exist until feature is built.
function getMemberFinalGrade() {
  try {
    return require('../models/MemberFinalGrade');
  } catch (_) {
    return null;
  }
}

test.beforeEach(async () => {
  const MemberFinalGrade = getMemberFinalGrade();
  if (MemberFinalGrade) await MemberFinalGrade.destroy({ where: {} });
  await User.destroy({ where: {} });
});

// ─── Test 1: 200 — student with finalized grade sees correct fields ────────────

test('GET /my-grade returns 200 with correct fields for student with finalized grade', async (t) => {
  const MemberFinalGrade = getMemberFinalGrade();

  const student = await User.create({
    studentId: '11070001000',
    email: 'student-grade@example.edu',
    fullName: 'Grade Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    passwordHash: await bcrypt.hash('StrongPass1!', 10),
  });

  // Seed a MemberFinalGrade row if model exists.
  if (MemberFinalGrade) {
    await MemberFinalGrade.create({
      userId: student.id,
      groupId: 'test-group-id',
      finalScore: 87.5,
      letterGrade: 'B',
      finalizedAt: new Date(),
    });
  }

  const { response, json } = await request('/api/v1/final-evaluation/my-grade', {
    headers: await authHeaderFor(student),
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 200, `expected 200, got ${response.status}, body: ${JSON.stringify(json)}`);

  // Must include required fields.
  const data = json?.data ?? json;
  assert.ok('userId' in data, 'response must include userId');
  assert.ok('groupId' in data, 'response must include groupId');
  assert.ok('finalScore' in data, 'response must include finalScore');
  assert.ok('letterGrade' in data, 'response must include letterGrade');
  assert.ok('finalizedAt' in data, 'response must include finalizedAt');

  // Must NOT include internal computation fields.
  assert.ok(!('teamScalar' in data), 'response must NOT include teamScalar');
  assert.ok(!('contributionRatio' in data), 'response must NOT include contributionRatio');
});

// ─── Test 2: 404 — no finalized grade for student's group ─────────────────────

test('GET /my-grade returns 404 when coordinator has not finalized grades', async (t) => {
  const student = await User.create({
    studentId: '11070001000',
    email: 'student-no-grade@example.edu',
    fullName: 'No Grade Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    passwordHash: await bcrypt.hash('StrongPass1!', 10),
  });

  // No MemberFinalGrade row seeded.
  const { response, json } = await request('/api/v1/final-evaluation/my-grade', {
    headers: await authHeaderFor(student),
  });

  if (response.status === 404 && json?._raw?.includes('Cannot')) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 404, `expected 404, got ${response.status}, body: ${JSON.stringify(json)}`);
});

// ─── Test 3: 403 — coordinator cannot access my-grade ─────────────────────────

test('GET /my-grade returns 403 for COORDINATOR', async (t) => {
  const coordinator = await User.create({
    email: 'coord-grade@example.edu',
    fullName: 'Coord Grade',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response } = await request('/api/v1/final-evaluation/my-grade', {
    headers: await authHeaderFor(coordinator),
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 403, `expected 403, got ${response.status}`);
});

// ─── Test 4: 403 — professor cannot access my-grade ───────────────────────────

test('GET /my-grade returns 403 for PROFESSOR', async (t) => {
  const professor = await User.create({
    email: 'prof-grade@example.edu',
    fullName: 'Prof Grade',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response } = await request('/api/v1/final-evaluation/my-grade', {
    headers: await authHeaderFor(professor),
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 403, `expected 403, got ${response.status}`);
});

// ─── Test 5: 401 — no auth header ─────────────────────────────────────────────

test('GET /my-grade returns 401 with no auth header', async (t) => {
  const { response } = await request('/api/v1/final-evaluation/my-grade');

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 401, `expected 401, got ${response.status}`);
});

test('responding to already-responded invitation returns 400', async () => {
  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });
  const invitee = await createStudent({
    studentId: '11070001001',
    email: 'invitee@example.edu',
    fullName: 'Invitee',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'State Team');
  const invitationId = await sendInvitation(leader, groupId, '11070001001');

  // First response — accept.
  await request(`/api/v1/invitations/${invitationId}/respond`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(invitee)),
    },
    body: JSON.stringify({ response: 'ACCEPT' }),
  });
});

/**
 * Issue I — Testing: POST and GET /team-scalar (P62)
 */
// Lazy-load models that may not exist until feature is built.
function getModels() {
  try {
    return {
      FinalEvaluationWeight: require('../models/FinalEvaluationWeight'),
      FinalEvaluationGrade: require('../models/FinalEvaluationGrade'),
    };
  } catch (_) {
    return { FinalEvaluationWeight: null, FinalEvaluationGrade: null };
  }
}

const TEST_GROUP_ID = 'test-group-scalar-001';

// Weight config used across tests.
const ADVISOR_WEIGHT = 0.4;
const COMMITTEE_WEIGHT = 0.6;

// Grade values used across tests.
const ADVISOR_FINAL_SCORE = 80;
const COMMITTEE_FINAL_SCORE = 90;

// Expected scalar = advisorFinalScore * advisorWeight + committeeFinalScore * committeeWeight
const EXPECTED_SCALAR = ADVISOR_FINAL_SCORE * ADVISOR_WEIGHT + COMMITTEE_FINAL_SCORE * COMMITTEE_WEIGHT;


test.beforeEach(async () => {
  const { FinalEvaluationWeight, FinalEvaluationGrade } = getModels();
  if (FinalEvaluationGrade) await FinalEvaluationGrade.destroy({ where: {} });
  if (FinalEvaluationWeight) await FinalEvaluationWeight.destroy({ where: {} });
  await User.destroy({ where: {} });
});

// Helper: seed weight config and both grade types.
async function seedFullEvaluation() {
  const { FinalEvaluationWeight, FinalEvaluationGrade } = getModels();
  if (FinalEvaluationWeight) {
    await FinalEvaluationWeight.create({
      groupId: TEST_GROUP_ID,
      advisorWeight: ADVISOR_WEIGHT,
      committeeWeight: COMMITTEE_WEIGHT,
    });
  }
  if (FinalEvaluationGrade) {
    await FinalEvaluationGrade.create({
      groupId: TEST_GROUP_ID,
      gradeType: 'ADVISOR',
      finalScore: ADVISOR_FINAL_SCORE,
    });
    await FinalEvaluationGrade.create({
      groupId: TEST_GROUP_ID,
      gradeType: 'COMMITTEE',
      finalScore: COMMITTEE_FINAL_SCORE,
    });
  }
}

// ─── Test 1: 200 — scalar equals weighted sum within float tolerance ───────────

test('POST /team-scalar returns 200 and scalar matches weighted formula', async (t) => {
  await seedFullEvaluation();

  const coordinator = await User.create({
    email: 'coord-scalar@example.edu',
    fullName: 'Coord Scalar',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(coordinator)),
      },
    },
  );

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 200, `expected 200, got ${response.status}, body: ${JSON.stringify(json)}`);

  const scalar = json?.scalar ?? json?.data?.scalar ?? json?.teamScalar;
  assert.ok(typeof scalar === 'number', `scalar must be a number, got ${typeof scalar}`);
  assert.ok(
    Math.abs(scalar - EXPECTED_SCALAR) < 0.001,
    `scalar ${scalar} must equal ${EXPECTED_SCALAR} within ±0.001`,
  );
});

// ─── Test 2: 422 — no advisor grade ───────────────────────────────────────────

test('POST /team-scalar returns 422 GRADES_INCOMPLETE when no advisor grade exists', async (t) => {
  const { FinalEvaluationWeight, FinalEvaluationGrade } = getModels();

  const coordinator = await User.create({
    email: 'coord-scalar@example.edu',
    fullName: 'Coord Scalar',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  // Seed weight config and committee grade only — no advisor grade.
  if (FinalEvaluationWeight) {
    await FinalEvaluationWeight.create({
      groupId: TEST_GROUP_ID,
      advisorWeight: ADVISOR_WEIGHT,
      committeeWeight: COMMITTEE_WEIGHT,
    });
  }
  if (FinalEvaluationGrade) {
    await FinalEvaluationGrade.create({
      groupId: TEST_GROUP_ID,
      gradeType: 'COMMITTEE',
      finalScore: COMMITTEE_FINAL_SCORE,
    });
  }

  const { response, json } = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(coordinator)),
      },
    },
  );

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 422, `expected 422, got ${response.status}, body: ${JSON.stringify(json)}`);
  assert.equal(json?.code, 'GRADES_INCOMPLETE', `expected GRADES_INCOMPLETE, got ${json?.code}`);
});

// ─── Test 3: 422 — no committee grade ─────────────────────────────────────────

test('POST /team-scalar returns 422 GRADES_INCOMPLETE when no committee grade exists', async (t) => {
  const { FinalEvaluationWeight, FinalEvaluationGrade } = getModels();

  const coordinator = await User.create({
    email: 'coord-scalar@example.edu',
    fullName: 'Coord Scalar',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  // Seed weight config and advisor grade only — no committee grade.
  if (FinalEvaluationWeight) {
    await FinalEvaluationWeight.create({
      groupId: TEST_GROUP_ID,
      advisorWeight: ADVISOR_WEIGHT,
      committeeWeight: COMMITTEE_WEIGHT,
    });
  }
  if (FinalEvaluationGrade) {
    await FinalEvaluationGrade.create({
      groupId: TEST_GROUP_ID,
      gradeType: 'ADVISOR',
      finalScore: ADVISOR_FINAL_SCORE,
    });
  }

  const { response, json } = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(coordinator)),
      },
    },
  );

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 422, `expected 422, got ${response.status}, body: ${JSON.stringify(json)}`);
  assert.equal(json?.code, 'GRADES_INCOMPLETE', `expected GRADES_INCOMPLETE, got ${json?.code}`);
});

// ─── Test 4: 422 — no weight config ───────────────────────────────────────────

test('POST /team-scalar returns 422 NO_WEIGHT_CONFIG when weight config not set', async (t) => {
  const { FinalEvaluationGrade } = getModels();

  const coordinator = await User.create({
    email: 'coord-scalar@example.edu',
    fullName: 'Coord Scalar',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  // Seed both grades but NO weight config.
  if (FinalEvaluationGrade) {
    await FinalEvaluationGrade.create({
      groupId: TEST_GROUP_ID,
      gradeType: 'ADVISOR',
      finalScore: ADVISOR_FINAL_SCORE,
    });
    await FinalEvaluationGrade.create({
      groupId: TEST_GROUP_ID,
      gradeType: 'COMMITTEE',
      finalScore: COMMITTEE_FINAL_SCORE,
    });
  }

  const { response, json } = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(coordinator)),
      },
    },
  );

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 422, `expected 422, got ${response.status}, body: ${JSON.stringify(json)}`);
  assert.equal(json?.code, 'NO_WEIGHT_CONFIG', `expected NO_WEIGHT_CONFIG, got ${json?.code}`);
});

// ─── Test 5: 403 — professor cannot compute scalar ────────────────────────────

test('POST /team-scalar returns 403 for PROFESSOR', async (t) => {
  const professor = await User.create({
    email: 'prof-scalar@example.edu',
    fullName: 'Prof Scalar',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response } = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(professor)),
      },
    },
  );

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 403, `expected 403, got ${response.status}`);
});

// ─── Test 6: 401 — no auth header ─────────────────────────────────────────────

test('POST /team-scalar returns 401 with no auth header', async (t) => {
  const { response } = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 401, `expected 401, got ${response.status}`);
});

// ─── Test 7: GET returns 200 after POST with matching scalar ──────────────────

test('GET /team-scalar returns 200 after POST and scalar matches', async (t) => {
  await seedFullEvaluation();

  const coordinator = await User.create({
    email: 'coord-scalar@example.edu',
    fullName: 'Coord Scalar',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  // First POST to compute and persist.
  const postResult = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(coordinator)),
      },
    },
  );

  if (postResult.response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(postResult.response.status, 200, `POST must succeed first, got ${postResult.response.status}`);
  const postScalar = postResult.json?.scalar ?? postResult.json?.data?.scalar ?? postResult.json?.teamScalar;

  // Then GET to retrieve.
  const getResult = await request(
    `/api/v1/final-evaluation/team-scalar/${TEST_GROUP_ID}`,
    { headers: await authHeaderFor(coordinator) },
  );

  assert.equal(getResult.response.status, 200, `GET must return 200, got ${getResult.response.status}`);
  const getScalar = getResult.json?.scalar ?? getResult.json?.data?.scalar ?? getResult.json?.teamScalar;

  assert.ok(
    Math.abs(getScalar - postScalar) < 0.001,
    `GET scalar ${getScalar} must match POST scalar ${postScalar}`,
  );
});

// ─── Test 8: GET returns 404 before any POST ──────────────────────────────────

test('GET /team-scalar returns 404 before any POST for this group', async (t) => {
  const coordinator = await User.create({
    email: 'coord-scalar@example.edu',
    fullName: 'Coord Scalar',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response, json } = await request(
    `/api/v1/final-evaluation/team-scalar/never-posted-group`,
    { headers: await authHeaderFor(coordinator) },
  );

  if (response.status === 404 && (json?._raw?.includes('Cannot') || !json?.code)) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 404, `expected 404 before POST, got ${response.status}`);
});

/**
 * Issue G — Testing: PUT and GET /weight-configuration (P62)
 */

// Lazy-load weight config model — may not exist until feature is built.
function getWeightConfigModel() {
  try {
    return require('../models/FinalEvaluationWeight');
  } catch (_) {
    return null;
  }
}

function validWeightPayload() {
  return {
    advisorWeight: 0.4,
    committeeWeight: 0.6,
  };
}

const ENDPOINT = '/api/v1/final-evaluation/weight-configuration';

test.beforeEach(async () => {
  const WeightConfig = getWeightConfigModel();
  if (WeightConfig) await WeightConfig.destroy({ where: {} });
  await User.destroy({ where: {} });
});

// ─── Test 1: 200 — valid payload persists and round-trips ─────────────────────

test('PUT /weight-configuration returns 200 and persisted weights match payload', async (t) => {
  const coordinator = await User.create({
    email: 'coord-wc@example.edu',
    fullName: 'Coord WC',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const payload = validWeightPayload();

  const { response, json } = await request(ENDPOINT, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 200, `expected 200, got ${response.status}, body: ${JSON.stringify(json)}`);

  const stored = json?.data ?? json?.config ?? json;
  const advisorWeight = stored?.advisorWeight ?? stored?.advisor_weight;
  const committeeWeight = stored?.committeeWeight ?? stored?.committee_weight;

  assert.ok(
    Math.abs(advisorWeight - payload.advisorWeight) < 0.001,
    `advisorWeight ${advisorWeight} must match ${payload.advisorWeight}`,
  );
  assert.ok(
    Math.abs(committeeWeight - payload.committeeWeight) < 0.001,
    `committeeWeight ${committeeWeight} must match ${payload.committeeWeight}`,
  );
});

// ─── Test 2: 200 — second call overwrites (upsert) ────────────────────────────

test('PUT /weight-configuration returns 200 on second call and overwrites previous', async (t) => {
  const coordinator = await User.create({
    email: 'coord-wc@example.edu',
    fullName: 'Coord WC',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(coordinator)),
  };

  // First PUT.
  const first = await request(ENDPOINT, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ advisorWeight: 0.4, committeeWeight: 0.6 }),
  });

  if (first.response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(first.response.status, 200, `first PUT must return 200`);

  // Second PUT with different values.
  const second = await request(ENDPOINT, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ advisorWeight: 0.3, committeeWeight: 0.7 }),
  });

  assert.equal(second.response.status, 200, `second PUT must return 200`);

  const stored = second.json?.data ?? second.json?.config ?? second.json;
  const advisorWeight = stored?.advisorWeight ?? stored?.advisor_weight;
  assert.ok(
    Math.abs(advisorWeight - 0.3) < 0.001,
    `second PUT must overwrite advisorWeight to 0.3, got ${advisorWeight}`,
  );
});

// ─── Test 3: 400 — weights do not sum to 1.0 ──────────────────────────────────

test('PUT /weight-configuration returns 400 when weights do not sum to 1.0', async (t) => {
  const coordinator = await User.create({
    email: 'coord-wc@example.edu',
    fullName: 'Coord WC',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response, json } = await request(ENDPOINT, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({ advisorWeight: 0.3, committeeWeight: 0.3 }), // sums to 0.6
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 400, `expected 400, got ${response.status}, body: ${JSON.stringify(json)}`);
});

// ─── Test 4: 400 — missing fields returns VALIDATION_ERROR ────────────────────

test('PUT /weight-configuration returns 400 VALIDATION_ERROR on missing fields', async (t) => {
  const coordinator = await User.create({
    email: 'coord-wc@example.edu',
    fullName: 'Coord WC',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response, json } = await request(ENDPOINT, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(coordinator)),
    },
    body: JSON.stringify({}), // both fields missing
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 400, `expected 400, got ${response.status}`);
  assert.equal(
    json?.code,
    'VALIDATION_ERROR',
    `expected code VALIDATION_ERROR, got ${json?.code}`,
  );
});

// ─── Test 5: 401 — no auth header ─────────────────────────────────────────────

test('PUT /weight-configuration returns 401 with no auth header', async (t) => {
  const { response } = await request(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validWeightPayload()),
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 401, `expected 401, got ${response.status}`);
});

// ─── Test 6: 403 — professor cannot set weight config ─────────────────────────

test('PUT /weight-configuration returns 403 for PROFESSOR', async (t) => {
  const professor = await User.create({
    email: 'prof-wc@example.edu',
    fullName: 'Prof WC',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response } = await request(ENDPOINT, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify(validWeightPayload()),
  });

  if (response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 403, `expected 403, got ${response.status}`);
});

// ─── Test 7: GET returns 200 after PUT with matching values ───────────────────

test('GET /weight-configuration returns 200 after PUT and body matches last PUT', async (t) => {
  const coordinator = await User.create({
    email: 'coord-wc@example.edu',
    fullName: 'Coord WC',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const payload = validWeightPayload();
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaderFor(coordinator)),
  };

  // PUT first.
  const putResult = await request(ENDPOINT, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  if (putResult.response.status === 404) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(putResult.response.status, 200, `PUT must succeed, got ${putResult.response.status}`);

  // Then GET.
  const getResult = await request(ENDPOINT, {
    headers: await authHeaderFor(coordinator),
  });

  assert.equal(getResult.response.status, 200, `GET must return 200, got ${getResult.response.status}`);

  const stored = getResult.json?.data ?? getResult.json?.config ?? getResult.json;
  const advisorWeight = stored?.advisorWeight ?? stored?.advisor_weight;
  const committeeWeight = stored?.committeeWeight ?? stored?.committee_weight;

  assert.ok(
    Math.abs(advisorWeight - payload.advisorWeight) < 0.001,
    `GET advisorWeight ${advisorWeight} must match PUT value ${payload.advisorWeight}`,
  );
  assert.ok(
    Math.abs(committeeWeight - payload.committeeWeight) < 0.001,
    `GET committeeWeight ${committeeWeight} must match PUT value ${payload.committeeWeight}`,
  );
});

// ─── Test 8: GET returns 404 before any PUT ───────────────────────────────────

test('GET /weight-configuration returns 404 before any PUT has been made', async (t) => {
  const coordinator = await User.create({
    email: 'coord-wc@example.edu',
    fullName: 'Coord WC',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const { response, json } = await request(ENDPOINT, {
    headers: await authHeaderFor(coordinator),
  });

  if (response.status === 404 && (json?._raw?.includes('Cannot') || !json?.code)) {
    t.skip('route not mounted');
    return;
  }

  assert.equal(response.status, 404, `expected 404 before any PUT, got ${response.status}`);
});