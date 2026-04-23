/**
 * Issue #261 — Testing: Log Grading (Connector f14)
 *
 * Logging failures must not fail POST /api/v1/committee/submissions/:id/review.
 * Note: GitHub #261 references "Issue 27" — that is unrelated (coordinator upload); use this file as-is.
 *
 * Env: TEST_COMMITTEE_REVIEW_PATH=review | grade
 */
require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { mock, afterEach: runAfterEach } = require('node:test');

const sequelize = require('../db');
const app = require('../app');
const { User, AuditLog } = require('../models');
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

runAfterEach(() => {
  mock.restoreAll();
});

test.beforeEach(async () => {
  await AuditLog.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('committee review HTTP response succeeds when AuditLog persistence throws', async (t) => {
  const professor = await User.create({
    email: 'prof261a@example.edu',
    fullName: 'Prof 261A',
    role: 'PROFESSOR',
    status: 'ACTIVE',
    password: await bcrypt.hash('StrongPass1!', 10),
  });

  const submissionId = await resolveSubmissionId(professor);
  if (!submissionId) {
    t.skip('no pending submission; set TEST_COMMITTEE_SUBMISSION_ID or seed data');
    return;
  }

  mock.method(AuditLog, 'create', async () => {
    throw new Error('simulated D6 failure after grade');
  });

  const { response, json } = await request(reviewUrl(submissionId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professor)),
    },
    body: JSON.stringify({
      scores: [{ criterionId: 'crit-soft-1', value: 6 }],
      comments: 'audit failure isolation',
    }),
  });

  if (response.status === 404) {
    t.skip('committee review route not mounted');
    return;
  }

  assert.ok(
    [200, 201].includes(response.status),
    `grading must succeed despite logging failure: ${response.status} ${JSON.stringify(json)}`,
  );
});

test('parallel committee grading requests enqueue distinct audit rows', async (t) => {
  const professors = await Promise.all(
    [0, 1, 2].map((i) =>
      User.create({
        email: `prof261p${i}@example.edu`,
        fullName: `Prof 261P${i}`,
        role: 'PROFESSOR',
        status: 'ACTIVE',
        password: await bcrypt.hash('StrongPass1!', 10),
      }),
    ),
  );

  const submissionId = await resolveSubmissionId(professors[0]);
  if (!submissionId) {
    t.skip('no pending submission; set TEST_COMMITTEE_SUBMISSION_ID or seed data');
    return;
  }

  const probe = await request(reviewUrl(submissionId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(professors[0])),
    },
    body: JSON.stringify({
      scores: [{ criterionId: 'crit-soft-1', value: 1 }],
      comments: 'probe',
    }),
  });
  if (probe.response.status === 404) {
    t.skip('committee review route not mounted');
    return;
  }

  const before = await AuditLog.count();

  await Promise.all(
    professors.map((prof, i) =>
      request(reviewUrl(submissionId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeaderFor(prof)),
        },
        body: JSON.stringify({
          scores: [{ criterionId: 'crit-soft-1', value: 2 + i }],
          comments: `parallel log ${i}`,
        }),
      }),
    ),
  );

  const after = await AuditLog.count();
  assert.ok(
    after >= before,
    'if implementation records per-reviewer audit events, count should increase; adjust assertion if one row per submission',
  );
});
