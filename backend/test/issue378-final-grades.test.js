/**
 * Issue #378 — Per-member final grade computation and persistence.
 *
 * POST /api/v1/final-evaluation/groups/:groupId/finalize  (COORDINATOR only)
 * GET  /api/v1/final-evaluation/groups/:groupId/final-grades (COORDINATOR, PROFESSOR)
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const { User, MemberFinalGrade } = require('../models');
const { ensureValidStudentRegistry } = require('../services/studentService');
const { finalize, getFinalGrades, mapLetter } = require('../services/finalEvaluationService');

let server;
let baseUrl;

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  return { res, json };
}

function authHeader(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

const GROUP_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

const fakeGetTeamScalar = async () => 80;
const fakeGetContributions = async () => [
  { userId: 1, ratio: 50 },
  { userId: 2, ratio: 30 },
  { userId: 3, ratio: 20 },
];

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
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
  await sequelize.close();
});

test.beforeEach(async () => {
  await MemberFinalGrade.destroy({ where: {} });
});

// ── Unit: mapLetter ──────────────────────────────────────────────────────────

test('mapLetter returns correct letter grades', () => {
  assert.equal(mapLetter(100), 'A');
  assert.equal(mapLetter(90), 'A');
  assert.equal(mapLetter(89), 'B');
  assert.equal(mapLetter(80), 'B');
  assert.equal(mapLetter(79), 'C');
  assert.equal(mapLetter(70), 'C');
  assert.equal(mapLetter(69), 'D');
  assert.equal(mapLetter(60), 'D');
  assert.equal(mapLetter(59), 'F');
  assert.equal(mapLetter(0), 'F');
});

// ── Unit: service finalize ───────────────────────────────────────────────────

test('finalize computes correct scores and persists rows', async () => {
  const grades = await finalize(GROUP_ID, {
    getTeamScalar: fakeGetTeamScalar,
    getContributions: fakeGetContributions,
  });

  assert.equal(grades.length, 3);

  const g1 = grades.find((g) => g.userId === 1);
  assert.ok(g1, 'grade for userId 1 exists');
  // 80 * 50 / 100 = 40
  assert.equal(g1.finalScore, 40);
  assert.equal(g1.letterGrade, 'F');
  assert.equal(g1.teamScalar, 80);
  assert.equal(g1.contributionRatio, 50);

  const g2 = grades.find((g) => g.userId === 2);
  // 80 * 30 / 100 = 24
  assert.equal(g2.finalScore, 24);

  const g3 = grades.find((g) => g.userId === 3);
  // 80 * 20 / 100 = 16
  assert.equal(g3.finalScore, 16);
});

test('finalize caps finalScore at 100', async () => {
  const grades = await finalize(GROUP_ID, {
    getTeamScalar: async () => 110,
    getContributions: async () => [{ userId: 1, ratio: 100 }],
  });
  assert.equal(grades[0].finalScore, 100);
});

test('finalize replaces existing grades for the group on re-run', async () => {
  await finalize(GROUP_ID, {
    getTeamScalar: fakeGetTeamScalar,
    getContributions: fakeGetContributions,
  });

  await finalize(GROUP_ID, {
    getTeamScalar: async () => 90,
    getContributions: async () => [{ userId: 1, ratio: 100 }],
  });

  const all = await MemberFinalGrade.findAll({ where: { groupId: GROUP_ID } });
  assert.equal(all.length, 1);
  assert.equal(all[0].userId, 1);
  // 90 * 100 / 100 = 90
  assert.equal(all[0].finalScore, 90);
});

test('finalize throws MISSING_GROUP_ID when groupId is empty', async () => {
  await assert.rejects(
    () => finalize('', { getTeamScalar: fakeGetTeamScalar, getContributions: fakeGetContributions }),
    (err) => {
      assert.equal(err.code, 'MISSING_GROUP_ID');
      return true;
    },
  );
});

test('finalize throws TEAM_SCALAR_UNAVAILABLE when scalar is not a number', async () => {
  await assert.rejects(
    () => finalize(GROUP_ID, { getTeamScalar: async () => null, getContributions: fakeGetContributions }),
    (err) => {
      assert.equal(err.code, 'TEAM_SCALAR_UNAVAILABLE');
      return true;
    },
  );
});

test('finalize throws CONTRIBUTIONS_UNAVAILABLE when contributions are empty', async () => {
  await assert.rejects(
    () => finalize(GROUP_ID, { getTeamScalar: fakeGetTeamScalar, getContributions: async () => [] }),
    (err) => {
      assert.equal(err.code, 'CONTRIBUTIONS_UNAVAILABLE');
      return true;
    },
  );
});

// ── Unit: getFinalGrades ─────────────────────────────────────────────────────

test('getFinalGrades returns stored rows for a group', async () => {
  await finalize(GROUP_ID, {
    getTeamScalar: fakeGetTeamScalar,
    getContributions: fakeGetContributions,
  });

  const rows = await getFinalGrades(GROUP_ID);
  assert.equal(rows.length, 3);
});

test('getFinalGrades returns empty array when no grades stored', async () => {
  const rows = await getFinalGrades('no-such-group-id');
  assert.equal(rows.length, 0);
});

// ── HTTP: POST finalize ──────────────────────────────────────────────────────

test('POST /final-evaluation/groups/:id/finalize returns 401 without token', async () => {
  const { res } = await request(`/api/v1/final-evaluation/groups/${GROUP_ID}/finalize`, {
    method: 'POST',
  });
  assert.equal(res.status, 401);
});

test('POST /final-evaluation/groups/:id/finalize returns 403 for PROFESSOR role', async () => {
  const professor = await User.create({
    email: 'prof378@test.com',
    fullName: 'Prof 378',
    password: 'hashed',
    role: 'PROFESSOR',
  });

  const { res } = await request(`/api/v1/final-evaluation/groups/${GROUP_ID}/finalize`, {
    method: 'POST',
    headers: authHeader(professor),
  });
  assert.equal(res.status, 403);
});

test('GET /final-evaluation/groups/:id/final-grades returns 401 without token', async () => {
  const { res } = await request(`/api/v1/final-evaluation/groups/${GROUP_ID}/final-grades`);
  assert.equal(res.status, 401);
});

test('GET /final-evaluation/groups/:id/final-grades returns 200 with empty data when no grades exist', async () => {
  const coordinator = await User.create({
    email: 'coord378@test.com',
    fullName: 'Coord 378',
    password: 'hashed',
    role: 'COORDINATOR',
  });

  const { res, json } = await request(`/api/v1/final-evaluation/groups/${GROUP_ID}/final-grades`, {
    headers: authHeader(coordinator),
  });
  assert.equal(res.status, 200);
  assert.equal(json.code, 'SUCCESS');
  assert.ok(Array.isArray(json.data));
  assert.equal(json.data.length, 0);
});
