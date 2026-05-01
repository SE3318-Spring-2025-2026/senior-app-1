const test = require('node:test');
const assert = require('node:assert/strict');

// Load normalizer directly without full app initialization to avoid unrelated route errors.
const { normalizePullRequestData } = require('../services/githubPrDataNormalizer');

// Test: normalizePullRequestData extracts full PR metadata and diff details.
// Validates extraction of prNumber, branchName, issueKey, prStatus, mergeStatus, and file changes.
test('normalizePullRequestData extracts PR metadata and diff details', () => {
  const result = normalizePullRequestData({
    number: 42,
    pull_request: {
      state: 'open',
      merged: false,
      draft: false,
      title: 'Implement ABC-123 feature',
      body: 'This update closes ABC-123 and touches two files.',
      head: {
        ref: 'feature/ABC-123-add-api',
      },
      mergeable_state: 'clean',
      additions: 12,
      deletions: 5,
      changed_files: 2,
      files: [
        {
          filename: 'src/a.js',
          status: 'modified',
          additions: 10,
          deletions: 4,
          changes: 14,
        },
        {
          filename: 'src/b.js',
          status: 'added',
          additions: 2,
          deletions: 1,
          changes: 3,
        },
      ],
    },
  });

  // Assertions validate all normalized fields.
  assert.equal(result.prNumber, 42);
  assert.equal(result.branchName, 'feature/ABC-123-add-api');
  assert.equal(result.issueKey, 'ABC-123');
  assert.equal(result.prStatus, 'OPEN');
  assert.equal(result.mergeStatus, 'MERGEABLE');
  assert.deepEqual(result.diffSummary, {
    additions: 12,
    deletions: 5,
    changedFilesCount: 2,
    totalChanges: 17,
    summary: '12 additions, 5 deletions across 2 files',
  });
  assert.equal(result.changedFiles.length, 2);
  assert.equal(result.changedFiles[0].filename, 'src/a.js');
});

// Test: normalizePullRequestData handles missing optional fields safely.
// Validates graceful handling of minimal payloads and null/absent fields.
test('normalizePullRequestData handles missing optional fields safely', () => {
  const result = normalizePullRequestData({
    pullRequest: {
      state: 'closed',
      merged_at: '2026-05-01T00:00:00.000Z',
      head: {
        ref: 'bugfix/no-issue-key',
      },
    },
  });

  // Assertions validate defaults for missing fields.
  assert.equal(result.prNumber, null);
  assert.equal(result.issueKey, null);
  assert.equal(result.prStatus, 'MERGED');
  assert.equal(result.mergeStatus, 'MERGED');
  assert.deepEqual(result.changedFiles, []);
});