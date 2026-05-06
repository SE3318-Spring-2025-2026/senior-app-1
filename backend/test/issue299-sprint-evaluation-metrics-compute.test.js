require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const ApiError = require('../errors/apiError');
const { computeSprintEvaluationMetrics } = require('../services/sprintEvaluationMetricsService');

test('throws VALIDATION_ERROR when storyData is missing', () => {
  assert.throws(
    () => computeSprintEvaluationMetrics({ teamId: 'team-1', sprintId: 'sprint-1' }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.message, 'Validation failed');
      assert.ok(Array.isArray(error.details));
      return true;
    },
  );
});

test('throws VALIDATION_ERROR when storyData is empty array', () => {
  assert.throws(
    () => computeSprintEvaluationMetrics({ teamId: 'team-1', sprintId: 'sprint-1', storyData: [] }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      return true;
    },
  );
});

test('computes completionRate, counts, and pr metrics as 0 when prData missing', () => {
  const result = computeSprintEvaluationMetrics({
    teamId: 'team-1',
    sprintId: 'sprint-1',
    storyData: [
      { issueKey: 'SPM-1', status: 'DONE' },
      { issueKey: 'SPM-2', status: 'IN_PROGRESS' },
      { issueKey: 'SPM-3', status: 'To Do' },
      { issueKey: 'SPM-4', status: 'CLOSED' },
    ],
    createdBy: 'evaluation-service',
  });

  assert.equal(result.teamId, 'team-1');
  assert.equal(result.sprintId, 'sprint-1');

  // completed: DONE + CLOSED => 2 / 4 = 50%
  assert.equal(result.computed.completedStoryCount, 2);
  assert.equal(result.computed.incompleteStoryCount, 2);
  assert.equal(result.computed.completionRate, 50);

  // PR missing -> 0
  assert.equal(result.computed.mergedPrCount, 0);
  assert.equal(result.computed.openPrCount, 0);
  assert.equal(result.computed.prCompletionRatio, 0);
  assert.equal(result.computed.issueToPrMappingCoverage, 0);

  // aggregatedScore should fall back to story only when no PRs
  assert.equal(result.computed.aggregatedScore, 50);

  // SprintEvaluationCreateRequest DTO compatibility
  assert.deepEqual(result.sprintEvaluationCreateRequest, {
    aggregatedScore: 50,
    completionRate: 50,
    createdBy: 'evaluation-service',
  });
});

test('computes prCompletionRatio and aggregatedScore with 70/30 weighting when PRs exist', () => {
  const result = computeSprintEvaluationMetrics({
    teamId: 'team-1',
    sprintId: 'sprint-1',
    storyData: [
      { issueKey: 'SPM-1', status: 'DONE' },
      { issueKey: 'SPM-2', status: 'DONE' },
      { issueKey: 'SPM-3', status: 'IN_PROGRESS' },
      { issueKey: 'SPM-4', status: 'IN_PROGRESS' },
    ],
    prData: [
      { prNumber: 1, prStatus: 'MERGED', issueKey: 'SPM-1' },
      { prNumber: 2, prStatus: 'MERGED', issueKey: 'SPM-2' },
      { prNumber: 3, prStatus: 'OPEN', issueKey: 'SPM-2' },
      { prNumber: 4, prStatus: 'OPEN', issueKey: null },
    ],
  });

  // completionRate: 2/4 => 50%
  assert.equal(result.computed.completionRate, 50);

  // prCompletionRatio: merged 2 / (2+2) => 50%
  assert.equal(result.computed.mergedPrCount, 2);
  assert.equal(result.computed.openPrCount, 2);
  assert.equal(result.computed.prCompletionRatio, 50);

  // aggregatedScore: 0.7*50 + 0.3*50 = 50
  assert.equal(result.computed.aggregatedScore, 50);
});

test('computes issue-to-PR mapping coverage based on unique linked issues intersecting sprint stories', () => {
  const result = computeSprintEvaluationMetrics({
    teamId: 'team-1',
    sprintId: 'sprint-1',
    storyData: [
      { issueKey: 'SPM-1', status: 'DONE' },
      { issueKey: 'SPM-2', status: 'DONE' },
      { issueKey: 'SPM-3', status: 'DONE' },
      { issueKey: 'SPM-4', status: 'DONE' },
    ],
    prData: [
      { prNumber: 1, prStatus: 'MERGED', issueKey: 'SPM-1' },
      { prNumber: 2, prStatus: 'MERGED', issueKey: 'SPM-1' }, // duplicate issue linkage
      { prNumber: 3, prStatus: 'OPEN', issueKey: 'SPM-3' },
      { prNumber: 4, prStatus: 'OPEN', issueKey: 'OTHER-999' }, // not in sprint stories
      { prNumber: 5, prStatus: 'OPEN' }, // missing issueKey
    ],
  });

  // unique linked issues within sprint = {SPM-1, SPM-3} => 2/4 => 50%
  assert.equal(result.computed.linkedIssueCount, 2);
  assert.equal(result.computed.issueToPrMappingCoverage, 50);
});

test('divide-by-zero is safe: prCompletionRatio is 0 when merged+open is 0 even if PR array exists', () => {
  const result = computeSprintEvaluationMetrics({
    teamId: 'team-1',
    sprintId: 'sprint-1',
    storyData: [{ issueKey: 'SPM-1', status: 'DONE' }],
    prData: [{ prNumber: 1, prStatus: 'DRAFT' }],
  });

  assert.equal(result.computed.mergedPrCount, 0);
  assert.equal(result.computed.openPrCount, 0);
  assert.equal(result.computed.prTotalCountForRatio, 0);
  assert.equal(result.computed.prCompletionRatio, 0);

  // PRs don't count for scoring if merged+open == 0
  assert.equal(result.computed.aggregatedScore, 100);
});

