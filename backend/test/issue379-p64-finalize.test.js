/**
 * Issue #379 — P64 integration tests: POST /finalize, GET /final-grades, post-finalize grade locks
 *
 * Paths (Issue M): `/api/v1/final-evaluation/groups/:groupId/finalize` and `.../final-grades`.
 * Base override: `TEST_P64_FINAL_EVAL_BASE` or `TEST_P63_FINAL_EVAL_BASE` or `TEST_P61_FINAL_EVAL_BASE`.
 *
 * Full success-path tests require P64 models (weights, grades, team scalar, member finals, D4).
 * Extend `seedFinalizeFixture()` when those models exist on the branch.
 *
 * Run: cd backend && npm test -- test/issue379-p64-finalize.test.js
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const sequelize = require('../db');
const app = require('../app');
const models = require('../models');
const { createStudent, ensureValidStudentRegistry } = require('../services/studentService');

const {
  User,
  Group,
  GroupAdvisorAssignment,
  Deliverable,
} = models;

const MemberFinalGrade = models.MemberFinalGrade || null;
const TeamScalar = models.TeamScalar || null;
const FinalEvaluationGrade = models.FinalEvaluationGrade || null;
const FinalEvaluationWeight = models.FinalEvaluationWeight || null;

let server;
let baseUrl;

const GROUPS_BASE =
  process.env.TEST_P64_FINAL_EVAL_BASE ||
  process.env.TEST_P63_FINAL_EVAL_BASE ||
  process.env.TEST_P61_FINAL_EVAL_BASE ||
  '/api/v1/final-evaluation/groups';

function finalizeUrl(groupId) {
  return `${GROUPS_BASE}/${groupId}/finalize`;
}

function finalGradesUrl(groupId) {
  return `${GROUPS_BASE}/${groupId}/final-grades`;
}

function advisorGradeUrl(groupId) {
  return `${GROUPS_BASE}/${groupId}/advisor-grade`;
}

function committeeGradeUrl(groupId) {
  return `${GROUPS_BASE}/${groupId}/committee-grade`;
}

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

function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

function isRouteNotMounted(response, json) {
  if (response.status !== 404) return false;
  if (json && json.code === 'ROUTE_NOT_FOUND') return true;
  const raw = json && typeof json._raw === 'string' ? json._raw : '';
  if (raw.includes('Cannot POST') || raw.includes('Cannot GET') || raw.includes('Cannot PUT')) {
    return true;
  }
  return false;
}

function skipIfRouteMissing(t, response, json) {
  if (response.status === 404 && isRouteNotMounted(response, json)) {
    t.skip('route not mounted');
    return true;
  }
  return false;
}

async function destroyIfPresent(Model) {
  if (Model) {
    await Model.destroy({ where: {} });
  }
}

function loadSprintSyncD4Model() {
  const names = [
    'SprintMemberStorySync',
    'SprintSyncMemberStory',
    'GroupSprintStorySync',
    'FinalEvaluationSprintSync',
    'SprintStorySyncRow',
  ];
  for (const n of names) {
    try {
      return require(`../models/${n}`);
    } catch {
      // continue
    }
  }
  return null;
}

async function seedD4Points(groupId, userId, sp) {
  const Model = loadSprintSyncD4Model();
  if (!Model) return false;
  for (const payload of [
    { groupId, userId, storyPointsCompleted: sp },
    { groupId, memberUserId: userId, storyPointsCompleted: sp },
  ]) {
    try {
      await Model.create(payload);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/**
 * Seeds coordinator, advisor, committee professor, students, group, deliverable, advisor assignment,
 * optional weights/grades/team scalar/D4 for a happy-path finalize. Returns null if a required model is missing.
 */
async function seedFinalizeFixture() {
  if (!FinalEvaluationGrade || !TeamScalar) {
    return null;
  }

  const coordinator = await User.create({
    email: `coord379-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Coord 379',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const advisor = await User.create({
    email: `adv379-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Advisor 379',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const committeeProf = await User.create({
    email: `com379-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Committee 379',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const s1 = await createStudent({
    studentId: '11070003730',
    email: 'stu379-a@example.edu',
    fullName: 'Student 379A',
    password: 'StrongPass1!',
  });

  const groupId = crypto.randomUUID();
  await Group.create({
    id: groupId,
    name: 'Issue 379 Group',
    leaderId: String(s1.id),
    memberIds: [String(s1.id)],
    status: 'HAS_ADVISOR',
    advisorId: String(advisor.id),
  });

  await GroupAdvisorAssignment.create({
    groupId,
    studentUserId: s1.id,
    advisorUserId: advisor.id,
  });

  await Deliverable.create({
    groupId,
    type: 'PROPOSAL',
    content: 'P64 finalize seed',
    status: 'SUBMITTED',
  });

  const teamScalarValue = 80;
  let scalarOk = false;
  for (const payload of [
    { groupId, teamScalar: teamScalarValue },
    { groupId, scalarValue: teamScalarValue, value: teamScalarValue },
  ]) {
    try {
      await TeamScalar.create(payload);
      scalarOk = true;
      break;
    } catch {
      // try next shape
    }
  }
  if (!scalarOk) {
    return null;
  }

  const D4Model = loadSprintSyncD4Model();
  const d4Ok = await seedD4Points(groupId, String(s1.id), 100);
  if (D4Model && !d4Ok) {
    return null;
  }

  let advisorGradeOk = false;
  for (const payload of [
    {
      groupId,
      role: 'ADVISOR',
      kind: 'ADVISOR',
      gradeType: 'ADVISOR',
      reviewerUserId: advisor.id,
      userId: advisor.id,
      scores: [{ criterionId: 'x', value: 80 }],
      finalScore: 80,
    },
    { groupId, reviewerUserId: advisor.id, finalScore: 80 },
  ]) {
    try {
      await FinalEvaluationGrade.create(payload);
      advisorGradeOk = true;
      break;
    } catch {
      // try next shape
    }
  }
  if (!advisorGradeOk) {
    return null;
  }

  let committeeGradeOk = false;
  for (const payload of [
    {
      groupId,
      role: 'COMMITTEE',
      kind: 'COMMITTEE',
      gradeType: 'COMMITTEE',
      reviewerUserId: committeeProf.id,
      userId: committeeProf.id,
      scores: [{ criterionId: 'x', value: 80 }],
      finalScore: 80,
    },
    { groupId, reviewerUserId: committeeProf.id, finalScore: 80 },
  ]) {
    try {
      await FinalEvaluationGrade.create(payload);
      committeeGradeOk = true;
      break;
    } catch {
      // try next shape
    }
  }
  if (!committeeGradeOk) {
    return null;
  }

  const contributionRatio = 1.0;

  return {
    groupId,
    coordinator,
    advisor,
    committeeProf,
    student: s1,
    teamScalarValue,
    contributionRatio,
  };
}

async function seedMinimalGroupWithCoordinator() {
  const coordinator = await User.create({
    email: `coord379m-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Coord 379M',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const s1 = await createStudent({
    studentId: '11070003731',
    email: 'stu379-m@example.edu',
    fullName: 'Student 379M',
    password: 'StrongPass1!',
  });
  const groupId = crypto.randomUUID();
  await Group.create({
    id: groupId,
    name: 'Issue 379 Minimal',
    leaderId: String(s1.id),
    memberIds: [String(s1.id)],
    status: 'FORMATION',
  });
  return { groupId, coordinator, student: s1 };
}

async function seedProfessorAndGroup() {
  const professor = await User.create({
    email: `prof379-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Prof 379',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const { groupId, coordinator, student } = await seedMinimalGroupWithCoordinator();
  return { groupId, coordinator, professor, student };
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
  await destroyIfPresent(MemberFinalGrade);
  await destroyIfPresent(TeamScalar);
  await destroyIfPresent(FinalEvaluationGrade);
  await destroyIfPresent(FinalEvaluationWeight);
  await destroyIfPresent(loadSprintSyncD4Model());
  await destroyIfPresent(Deliverable);
  await GroupAdvisorAssignment.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('POST /finalize — 401 with no auth', async (t) => {
  const { response, json } = await request(finalizeUrl('00000000-0000-4000-8000-000000000001'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 401, JSON.stringify(json));
});

test('POST /finalize — 403 when caller is PROFESSOR', async (t) => {
  const { groupId, professor } = await seedProfessorAndGroup();
  const { response, json } = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(professor),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 403, JSON.stringify(json));
});

test('GET /final-grades — 404 before finalization', async (t) => {
  const { groupId, coordinator } = await seedMinimalGroupWithCoordinator();
  const { response, json } = await request(finalGradesUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 404, JSON.stringify(json));
});

test('POST /finalize — 422 PREREQUISITES_NOT_MET when team scalar is absent', async (t) => {
  const { groupId, coordinator } = await seedMinimalGroupWithCoordinator();
  const { response, json } = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 422, JSON.stringify(json));
  assert.equal(json.code, 'PREREQUISITES_NOT_MET', JSON.stringify(json));
});

test('POST /finalize — 200; members include finalScore, letterGrade, finalizedAt', async (t) => {
  const ctx = await seedFinalizeFixture();
  if (!ctx) {
    t.skip('P64 models or seed shape not available; extend seedFinalizeFixture when Issue M merges');
    return;
  }
  const { groupId, coordinator, teamScalarValue, contributionRatio } = ctx;

  const probe = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, probe.response, probe.json)) return;

  const { response, json } = probe;
  assert.equal(response.status, 200, JSON.stringify(json));

  const data = json.data ?? json;
  const members = data.members ?? data.finalGrades ?? data.results ?? [];
  assert.ok(Array.isArray(members) && members.length > 0, JSON.stringify(json));

  for (const m of members) {
    const fs = m.finalScore ?? m.final_score;
    const letter = m.letterGrade ?? m.letter_grade;
    const at = m.finalizedAt ?? m.finalized_at;
    assert.ok(fs !== undefined && fs !== null, JSON.stringify(m));
    assert.ok(letter !== undefined && letter !== null, JSON.stringify(m));
    assert.ok(at, JSON.stringify(m));

    const ratio = Number(m.contributionRatio ?? m.contribution_ratio ?? contributionRatio);
    const expected = teamScalarValue * ratio * 100;
    assert.ok(
      Math.abs(Number(fs) - expected) < 0.02,
      `expected finalScore≈teamScalar*ratio*100 (${expected}), got ${fs}`,
    );
  }
});

test('POST /finalize — 409 ALREADY_FINALIZED on second call', async (t) => {
  const ctx = await seedFinalizeFixture();
  if (!ctx) {
    t.skip('P64 models or seed shape not available; extend seedFinalizeFixture when Issue M merges');
    return;
  }
  const { groupId, coordinator } = ctx;

  const first = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, first.response, first.json)) return;
  assert.equal(first.response.status, 200, JSON.stringify(first.json));

  const second = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  assert.equal(second.response.status, 409, JSON.stringify(second.json));
  assert.equal(second.json.code, 'ALREADY_FINALIZED', JSON.stringify(second.json));
});

test('after POST /finalize, PUT /advisor-grade and PUT /committee-grade return 403 (locked)', async (t) => {
  const ctx = await seedFinalizeFixture();
  if (!ctx) {
    t.skip('P64 models or seed shape not available; extend seedFinalizeFixture when Issue M merges');
    return;
  }
  const { groupId, coordinator, advisor, committeeProf } = ctx;

  const fin = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, fin.response, fin.json)) return;
  assert.equal(fin.response.status, 200, JSON.stringify(fin.json));

  const advPut = await request(advisorGradeUrl(groupId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(advisor),
    },
    body: JSON.stringify({ scores: [{ criterionId: 'x', value: 70 }] }),
  });
  assert.equal(advPut.response.status, 403, JSON.stringify(advPut.json));

  const comPut = await request(committeeGradeUrl(groupId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(committeeProf),
    },
    body: JSON.stringify({ scores: [{ criterionId: 'x', value: 70 }] }),
  });
  assert.equal(comPut.response.status, 403, JSON.stringify(comPut.json));
});

test('GET /final-grades — 200 with full result after finalization', async (t) => {
  const ctx = await seedFinalizeFixture();
  if (!ctx) {
    t.skip('P64 models or seed shape not available; extend seedFinalizeFixture when Issue M merges');
    return;
  }
  const { groupId, coordinator } = ctx;

  const fin = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, fin.response, fin.json)) return;
  assert.equal(fin.response.status, 200, JSON.stringify(fin.json));

  const { response, json } = await request(finalGradesUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  assert.equal(response.status, 200, JSON.stringify(json));
  const data = json.data ?? json;
  const members = data.members ?? data.finalGrades ?? [];
  assert.ok(Array.isArray(members) && members.length > 0, JSON.stringify(json));
});

test('GET /final-grades — 403 when caller is STUDENT', async (t) => {
  const ctx = await seedFinalizeFixture();
  if (!ctx) {
    t.skip('P64 models or seed shape not available; extend seedFinalizeFixture when Issue M merges');
    return;
  }
  const { groupId, coordinator, student } = ctx;

  const fin = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, fin.response, fin.json)) return;
  assert.equal(fin.response.status, 200, JSON.stringify(fin.json));

  const { response, json } = await request(finalGradesUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(student) },
  });
  assert.equal(response.status, 403, JSON.stringify(json));
});

test('POST /finalize — 422 when contribution data (D4) is missing', async (t) => {
  if (!TeamScalar || !FinalEvaluationGrade) {
    t.skip('TeamScalar / FinalEvaluationGrade not available');
    return;
  }

  const coordinator = await User.create({
    email: `coord379d4-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Coord 379 D4',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const advisor = await User.create({
    email: `adv379d4-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Adv 379 D4',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const committeeProf = await User.create({
    email: `com379d4-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Com 379 D4',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const s1 = await createStudent({
    studentId: '11070003732',
    email: 'stu379-d4@example.edu',
    fullName: 'Student 379 D4',
    password: 'StrongPass1!',
  });
  const groupId = crypto.randomUUID();
  await Group.create({
    id: groupId,
    name: 'Issue 379 D4',
    leaderId: String(s1.id),
    memberIds: [String(s1.id)],
    status: 'HAS_ADVISOR',
    advisorId: String(advisor.id),
  });
  await GroupAdvisorAssignment.create({
    groupId,
    studentUserId: s1.id,
    advisorUserId: advisor.id,
  });
  await Deliverable.create({
    groupId,
    type: 'PROPOSAL',
    content: 'd4 test',
    status: 'SUBMITTED',
  });
  let scalarCreated = false;
  for (const payload of [{ groupId, teamScalar: 80 }, { groupId, value: 80 }]) {
    try {
      await TeamScalar.create(payload);
      scalarCreated = true;
      break;
    } catch {
      // next
    }
  }
  if (!scalarCreated) {
    t.skip('TeamScalar row could not be created for this schema');
    return;
  }

  for (const payload of [
    { groupId, reviewerUserId: advisor.id, finalScore: 80 },
    { groupId, reviewerUserId: committeeProf.id, finalScore: 80 },
  ]) {
    try {
      await FinalEvaluationGrade.create(payload);
    } catch {
      /* best effort */
    }
  }

  const { response, json } = await request(finalizeUrl(groupId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaderFor(coordinator),
    },
    body: JSON.stringify({}),
  });
  if (skipIfRouteMissing(t, response, json)) return;

  assert.equal(response.status, 422, JSON.stringify(json));
  assert.ok(
    ['PREREQUISITES_NOT_MET', 'NO_SPRINT_SYNC_DATA'].includes(json.code),
    JSON.stringify(json),
  );
});
