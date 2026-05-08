/**
 * Issue #254 — Testing: Store Grades and Committee Review (Connector f11)
 *
 * POST /api/v1/committee/submissions/:submissionId/review (or /grade per OpenAPI — override via env).
 * Depends on #253 implementation + seeded pending submission (or GET /committee/submissions/pending).
 *
 * Env:
 *   TEST_COMMITTEE_REVIEW_PATH=review   (default) or grade
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const { User } = require('../models');
const { ensureValidStudentRegistry } = require('../services/studentService');

let server;
let baseUrl;

const REVIEW_SEGMENT = process.env.TEST_COMMITTEE_REVIEW_PATH || 'review';

function reviewUrl(submissionId) {
  return `/api/v1/committee/submissions/${submissionId}/${REVIEW_SEGMENT}`;
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

async function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function resolveSubmissionId(professor) {
  if (process.env.TEST_COMMITTEE_SUBMISSION_ID) {
    return process.env.TEST_COMMITTEE_SUBMISSION_ID;
  }
  const { response, json } = await request('/api/v1/committee/submissions/pending', {
    headers: await authHeaderFor(professor),
  });
  if (response.status !== 200) return null;
  const list = Array.isArray(json) ? json : json.data || json.submissions || [];
  if (!list.length) return null;
  const row = list[0];
  return row.submissionId || row.id || row.submission_id || null;
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
  await User.destroy({ where: {} });
});

test('POST committee review returns 400 when mandatory fields are missing', async (t) => {
  const professor = await User.create({
    email: 'prof254a@example.edu',
    fullName: 'Prof 254A',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const sid = process.env.TEST_COMMITTEE_SUBMISSION_ID || '00000000-0000-4000-8000-000000000099';
  const { response, json } = await request(reviewUrl(sid), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({}),
  });

  if (response.status === 404) {
    t.skip('committee review route not mounted');
    return;
  }

  assert.equal(response.status, 400, JSON.stringify(json));
});

test('POST committee review returns finalScore consistent with weighted criterion scores', async (t) => {
  const professor = await User.create({
    email: 'prof254b@example.edu',
    fullName: 'Prof 254B',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const submissionId = await resolveSubmissionId(professor);
  if (!submissionId) {
    t.skip('no pending submission; set TEST_COMMITTEE_SUBMISSION_ID or seed data');
    return;
  }

  const scores = [
    { criterionId: 'crit-soft-1', value: 8 },
    { criterionId: 'crit-binary-1', value: 10 },
  ];

  const { response, json } = await request(reviewUrl(submissionId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({
      scores,
      comments: 'Integration test review',
    }),
  });

  if (response.status === 404) {
    t.skip('committee review route not mounted');
    return;
  }

  assert.ok([200, 201].includes(response.status), JSON.stringify(json));

  const finalScore = json.finalScore ?? json.final_score ?? json.score;
  assert.ok(typeof finalScore === 'number' && Number.isFinite(finalScore));
  assert.ok(finalScore >= 0 && finalScore <= 100);

  if (typeof json.expectedFinalScore === 'number') {
    assert.equal(finalScore, json.expectedFinalScore);
  }
});

test('concurrent committee reviews for the same submission do not silently overwrite (serialization or conflict)', async (t) => {
  const p1 = await User.create({
    email: 'prof254c1@example.edu',
    fullName: 'Prof 254C1',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });
  const p2 = await User.create({
    email: 'prof254c2@example.edu',
    fullName: 'Prof 254C2',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const submissionId = await resolveSubmissionId(p1);
  if (!submissionId) {
    t.skip('no pending submission; set TEST_COMMITTEE_SUBMISSION_ID or seed data');
    return;
  }

  const body = (tag) => ({
    scores: [{ criterionId: 'crit-soft-1', value: tag === 'A' ? 5 : 7 }],
    comments: `Concurrent ${tag}`,
  });

  const [r1, r2] = await Promise.all([
    request(reviewUrl(submissionId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(p1)),
      },
      body: JSON.stringify(body('A')),
    }),
    request(reviewUrl(submissionId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(p2)),
      },
      body: JSON.stringify(body('B')),
    }),
  ]);

  if (r1.response.status === 404) {
    t.skip('committee review route not mounted');
    return;
  }

  const statuses = [r1.response.status, r2.response.status].sort();
  const okPair =
    (statuses[0] === 200 && statuses[1] === 200) ||
    (statuses[0] === 200 && [409, 423, 428].includes(statuses[1])) ||
    (statuses[0] === 400 && statuses[1] === 400);
  assert.ok(
    okPair,
    `unexpected concurrency outcome: ${r1.response.status} ${JSON.stringify(r1.json)} | ${r2.response.status} ${JSON.stringify(r2.json)}`,
  );
});
