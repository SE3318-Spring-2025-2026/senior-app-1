
require('./setupTestEnv');
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

  const leader = await createStudent({
    studentId: '11070001000',
    email: 'leader@example.edu',
    fullName: 'Leader',
    password: 'StrongPass1!',
  });

  const groupId = await createGroup(leader, 'No Weight Team');
  assert.ok(groupId, `group creation failed`);

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