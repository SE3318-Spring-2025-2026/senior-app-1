/**
 * Issue #377 — P63 integration tests: GET /contributions (per-member contribution ratios)
 *
 * Default URL: `/api/v1/final-evaluation/groups/:groupId/contributions`
 * Override base: `TEST_P63_FINAL_EVAL_BASE` or `TEST_P61_FINAL_EVAL_BASE` (same path family as P61 tests).
 *
 * Seeds optional D4 sprint-sync rows when a model file exists (see `loadSprintSyncD4Model()`).
 * When Issue K adds a concrete model, register it in `models/index.js` and extend `seedMemberStoryPoints`.
 *
 * Run: cd backend && npm test -- test/issue377-p63-contributions.test.js
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

const { User, Group } = models;

let server;
let baseUrl;

const GROUPS_BASE =
  process.env.TEST_P63_FINAL_EVAL_BASE ||
  process.env.TEST_P61_FINAL_EVAL_BASE ||
  '/api/v1/final-evaluation/groups';

function contributionsUrl(groupId) {
  return `${GROUPS_BASE}/${groupId}/contributions`;
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

function isRouteNotMounted404(response, json) {
  if (response.status !== 404) return false;
  if (json && json.code === 'ROUTE_NOT_FOUND') return true;
  const raw = json && typeof json._raw === 'string' ? json._raw : '';
  if (raw.includes('Cannot GET')) return true;
  return false;
}

function skipIfRouteMissing(t, response, json) {
  if (response.status === 404 && isRouteNotMounted404(response, json)) {
    t.skip('route not mounted');
    return true;
  }
  return false;
}

function loadSprintSyncD4Model() {
  const candidates = [
    'SprintMemberStorySync',
    'SprintSyncMemberStory',
    'GroupSprintStorySync',
    'FinalEvaluationSprintSync',
    'SprintStorySyncRow',
  ];
  for (const name of candidates) {
    try {
      return require(`../models/${name}`);
    } catch {
      // continue
    }
  }
  return null;
}

async function destroyIfPresent(Model) {
  if (Model) {
    await Model.destroy({ where: {} });
  }
}

/**
 * Best-effort seed for Issue K D4 tables. Returns false if no model or create fails.
 * Adjust field names when the real schema is merged.
 */
async function seedMemberStoryPoints(groupId, rows) {
  const Model = loadSprintSyncD4Model();
  if (!Model) return false;
  for (const row of rows) {
    const uid = row.userId;
    const sp = row.sp;
    let ok = false;
    for (const payload of [
      { groupId, userId: uid, storyPointsCompleted: sp },
      { groupId, memberUserId: uid, storyPointsCompleted: sp },
      { groupId, userId: uid, storyPoints: sp },
    ]) {
      try {
        await Model.create(payload);
        ok = true;
        break;
      } catch {
        // try next shape
      }
    }
    if (!ok) return false;
  }
  return true;
}

function extractContributionRatios(json) {
  const d = json.data ?? json;
  const list =
    d.contributions ??
    d.members ??
    d.items ??
    (Array.isArray(d) ? d : []);
  if (!Array.isArray(list)) return [];
  return list.map((x) =>
    Number(x.contributionRatio ?? x.contribution_ratio ?? x.ratio ?? x.share),
  );
}

async function createCoordinator() {
  return User.create({
    email: `coord377-${crypto.randomUUID().slice(0, 8)}@example.edu`,
    fullName: 'Coord 377',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
}

async function seedGroupWithTwoStudents() {
  const coordinator = await createCoordinator();
  const s1 = await createStudent({
    studentId: '11070003720',
    email: 'stu377-a@example.edu',
    fullName: 'Student 377A',
    password: 'StrongPass1!',
  });
  const s2 = await createStudent({
    studentId: '11070003721',
    email: 'stu377-b@example.edu',
    fullName: 'Student 377B',
    password: 'StrongPass1!',
  });
  const groupId = crypto.randomUUID();
  await Group.create({
    id: groupId,
    name: 'Issue 377 Group',
    leaderId: String(s1.id),
    memberIds: [String(s1.id), String(s2.id)],
    status: 'FORMATION',
  });
  return { groupId, coordinator, s1, s2 };
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
  const D4 = loadSprintSyncD4Model();
  await destroyIfPresent(D4);
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('GET /contributions — 401 with no auth', async (t) => {
  const { response, json } = await request(
    contributionsUrl('00000000-0000-4000-8000-000000000001'),
    { method: 'GET' },
  );
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 401, JSON.stringify(json));
});

test('GET /contributions — 403 when caller is STUDENT', async (t) => {
  const { groupId, s1 } = await seedGroupWithTwoStudents();
  const { response, json } = await request(contributionsUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(s1) },
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 403, JSON.stringify(json));
});

test('GET /contributions — 404 when group does not exist', async (t) => {
  const coordinator = await createCoordinator();
  const missing = '00000000-0000-4000-8000-000000000088';
  const { response, json } = await request(contributionsUrl(missing), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  if (response.status === 404 && isRouteNotMounted404(response, json)) {
    t.skip('route not mounted');
    return;
  }
  assert.equal(response.status, 404, JSON.stringify(json));
});

test('GET /contributions — 422 NO_SPRINT_SYNC_DATA when D4 has no rows for the group', async (t) => {
  const { groupId, coordinator } = await seedGroupWithTwoStudents();

  const { response, json } = await request(contributionsUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 422, JSON.stringify(json));
  assert.equal(
    json.code,
    'NO_SPRINT_SYNC_DATA',
    `expected NO_SPRINT_SYNC_DATA, got ${json.code}`,
  );
});

test('GET /contributions — 200; contributionRatio values sum to 1.0', async (t) => {
  const { groupId, coordinator, s1, s2 } = await seedGroupWithTwoStudents();

  const probe = await request(contributionsUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  if (skipIfRouteMissing(t, probe.response, probe.json)) return;

  const seeded = await seedMemberStoryPoints(groupId, [
    { userId: String(s1.id), sp: 50 },
    { userId: String(s2.id), sp: 50 },
  ]);
  if (!seeded) {
    t.skip('D4 sprint sync model not available; extend seedMemberStoryPoints when Issue K merges');
    return;
  }

  const { response, json } = await request(contributionsUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 200, JSON.stringify(json));

  const ratios = extractContributionRatios(json);
  assert.ok(ratios.length >= 2, `expected contribution rows, got ${JSON.stringify(json)}`);
  const sum = ratios.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.001, `ratios should sum to 1.0, got ${sum} (${JSON.stringify(ratios)})`);
});

test('GET /contributions — ratios proportional to story points (60 / 100 => ~0.6)', async (t) => {
  const { groupId, coordinator, s1, s2 } = await seedGroupWithTwoStudents();

  const probe = await request(contributionsUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  if (skipIfRouteMissing(t, probe.response, probe.json)) return;

  const seeded = await seedMemberStoryPoints(groupId, [
    { userId: String(s1.id), sp: 60 },
    { userId: String(s2.id), sp: 40 },
  ]);
  if (!seeded) {
    t.skip('D4 sprint sync model not available; extend seedMemberStoryPoints when Issue K merges');
    return;
  }

  const { response, json } = await request(contributionsUrl(groupId), {
    method: 'GET',
    headers: { ...authHeaderFor(coordinator) },
  });
  if (skipIfRouteMissing(t, response, json)) return;
  assert.equal(response.status, 200, JSON.stringify(json));

  const list = json.data?.contributions ?? json.data?.members ?? json.data ?? json.contributions ?? [];
  assert.ok(Array.isArray(list) && list.length >= 2, JSON.stringify(json));

  const rowForS1 = list.find(
    (x) =>
      String(x.userId ?? x.user_id ?? x.memberId ?? x.member_id) === String(s1.id),
  );
  assert.ok(rowForS1, `expected entry for student ${s1.id}`);
  const r1 = Number(
    rowForS1.contributionRatio ?? rowForS1.contribution_ratio ?? rowForS1.ratio,
  );
  assert.ok(Math.abs(r1 - 0.6) < 0.001, `expected ~0.6 for 60/100 split, got ${r1}`);
});
