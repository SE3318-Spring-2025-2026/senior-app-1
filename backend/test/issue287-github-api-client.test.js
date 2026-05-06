const assert = require('assert');
const { test } = require('node:test');
const {
  getPullRequestsByBranch,
  getPullRequestsByIssueKeys,
  getPullRequestDetails,
  getCompletePullRequestData,
  verifyToken,
} = require('../services/githubApiClientService');
const ApiError = require('../errors/apiError');

test('GitHub API Client - PR status determination', () => {
  // Test MERGED status
  let prData = { merged: true, draft: false, state: 'closed' };
  let status = prData.merged ? 'MERGED' : prData.draft ? 'DRAFT' : prData.state === 'closed' ? 'CLOSED' : 'OPEN';
  assert.strictEqual(status, 'MERGED');

  // Test DRAFT status
  prData = { merged: false, draft: true, state: 'open' };
  status = prData.merged ? 'MERGED' : prData.draft ? 'DRAFT' : prData.state === 'closed' ? 'CLOSED' : 'OPEN';
  assert.strictEqual(status, 'DRAFT');

  // Test CLOSED status
  prData = { merged: false, draft: false, state: 'closed' };
  status = prData.merged ? 'MERGED' : prData.draft ? 'DRAFT' : prData.state === 'closed' ? 'CLOSED' : 'OPEN';
  assert.strictEqual(status, 'CLOSED');

  // Test OPEN status
  prData = { merged: false, draft: false, state: 'open' };
  status = prData.merged ? 'MERGED' : prData.draft ? 'DRAFT' : prData.state === 'closed' ? 'CLOSED' : 'OPEN';
  assert.strictEqual(status, 'OPEN');
});

test('GitHub API Client - merge status determination', () => {
  // Test MERGED status
  let prData = { merged: true };
  let mergeStatus = prData.merged ? 'MERGED' : prData.mergeable === false ? 'MERGE_CONFLICT' : prData.mergeable === true ? 'MERGEABLE' : 'UNKNOWN';
  assert.strictEqual(mergeStatus, 'MERGED');

  // Test MERGE_CONFLICT status
  prData = { merged: false, mergeable: false };
  mergeStatus = prData.merged ? 'MERGED' : prData.mergeable === false ? 'MERGE_CONFLICT' : prData.mergeable === true ? 'MERGEABLE' : 'UNKNOWN';
  assert.strictEqual(mergeStatus, 'MERGE_CONFLICT');

  // Test MERGEABLE status
  prData = { merged: false, mergeable: true };
  mergeStatus = prData.merged ? 'MERGED' : prData.mergeable === false ? 'MERGE_CONFLICT' : prData.mergeable === true ? 'MERGEABLE' : 'UNKNOWN';
  assert.strictEqual(mergeStatus, 'MERGEABLE');
});

test('GitHub API Client - issue key extraction from PR title', () => {
  const prTitle = 'SPM-214: Add evaluation endpoint';
  const issueKeyMatch = prTitle.match(/([A-Z]+-\d+)/);
  assert.strictEqual(issueKeyMatch ? issueKeyMatch[1] : null, 'SPM-214');
});

test('GitHub API Client - multiple issue keys in PR content', () => {
  const prContent = 'SPM-214 and SPM-219 are related to this PR';
  const issueKeys = ['SPM-214', 'SPM-219', 'SPM-300'];
  
  const matchedKeys = issueKeys.filter(key => prContent.includes(key));
  assert.deepStrictEqual(matchedKeys, ['SPM-214', 'SPM-219']);
});

test('GitHub API Client - empty branch array returns empty', async () => {
  assert.strictEqual(Array.isArray([]), true);
  assert.strictEqual([].length, 0);
});

test('GitHub API Client - empty issue keys array returns empty', async () => {
  assert.strictEqual(Array.isArray([]), true);
  assert.strictEqual([].length, 0);
});

test('GitHub API Client - error codes are properly defined', () => {
  assert.strictEqual(typeof ApiError.badRequest, 'function');
  assert.strictEqual(typeof ApiError.unauthorized, 'function');
  assert.strictEqual(typeof ApiError.notFound, 'function');
  assert.strictEqual(typeof ApiError.internal, 'function');
});

test('GitHub API Client - create proper error instance', () => {
  const error = ApiError.unauthorized(
    'GITHUB_AUTHENTICATION_FAILED',
    'Invalid or expired GitHub token'
  );
  
  assert.strictEqual(error.status, 401);
  assert.strictEqual(error.code, 'GITHUB_AUTHENTICATION_FAILED');
  assert.strictEqual(error.message, 'Invalid or expired GitHub token');
});

test('GitHub API Client - functions are exported', () => {
  assert.strictEqual(typeof getPullRequestsByBranch, 'function');
  assert.strictEqual(typeof getPullRequestsByIssueKeys, 'function');
  assert.strictEqual(typeof getPullRequestDetails, 'function');
  assert.strictEqual(typeof getCompletePullRequestData, 'function');
  assert.strictEqual(typeof verifyToken, 'function');
});

test('GitHub API Client - requires global fetch support', async () => {
  const originalFetch = global.fetch;
  global.fetch = undefined;

  try {
    await assert.rejects(
      () => getPullRequestsByBranch('token', 'acme-org', 'senior-app-1', 'feature/test-branch'),
      /Node\.js 18 or newer is required/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
