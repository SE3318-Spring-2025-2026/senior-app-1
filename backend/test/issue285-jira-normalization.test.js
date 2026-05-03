require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeJiraIssue } = require('../services/jiraIssueNormalizer');

test('normalizes a Jira issue with direct and nested field mappings', async () => {
  const normalized = normalizeJiraIssue({
    key: 'SPM-214',
    fields: {
      summary: 'Implement sprint evaluation aggregation endpoint',
      description: 'Build the endpoint that combines story, PR, and AI validation metrics.',
      status: { name: 'In Progress' },
      customfield_10016: 5,
      assignee: { accountId: 'stu_20230017' },
      sprint: { id: 'sprint_2026_03' },
    },
  });

  assert.deepEqual(normalized, {
    issueKey: 'SPM-214',
    title: 'Implement sprint evaluation aggregation endpoint',
    description: 'Build the endpoint that combines story, PR, and AI validation metrics.',
    status: 'IN_PROGRESS',
    storyPoints: 5,
    assigneeId: 'stu_20230017',
    reporterId: null,
    sprintId: 'sprint_2026_03',
    sourceCreatedAt: null,
    sourceUpdatedAt: null,
  });
});

test('normalization safely handles missing description and assignee fields', async () => {
  const normalized = normalizeJiraIssue({
    key: 'SPM-215',
    fields: {
      summary: 'Handle sparse Jira issue payloads',
      status: { name: 'To Do' },
      sprint: { id: 'sprint_2026_03' },
    },
  });

  assert.equal(normalized.issueKey, 'SPM-215');
  assert.equal(normalized.title, 'Handle sparse Jira issue payloads');
  assert.equal(normalized.description, null);
  assert.equal(normalized.status, 'TO_DO');
  assert.equal(normalized.storyPoints, null);
  assert.equal(normalized.assigneeId, null);
  assert.equal(normalized.reporterId, null);
  assert.equal(normalized.sprintId, 'sprint_2026_03');
  assert.equal(normalized.sourceCreatedAt, null);
  assert.equal(normalized.sourceUpdatedAt, null);
});

test('normalization extracts text from Atlassian document descriptions', async () => {
  const normalized = normalizeJiraIssue({
    key: 'SPM-216',
    fields: {
      summary: 'Normalize Atlassian document content',
      description: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'First line' },
              { type: 'text', text: ' of text.' },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second line of text.' }],
          },
        ],
      },
      status: { name: 'Done' },
      customfield_10016: '8',
      assignee: { id: 'jira-user-17' },
      sprint: { id: 'sprint_2026_04' },
    },
  });

  assert.equal(normalized.description, 'First line of text.\nSecond line of text.');
  assert.equal(normalized.storyPoints, 8);
  assert.equal(normalized.assigneeId, 'jira-user-17');
  assert.equal(normalized.reporterId, null);
  assert.equal(normalized.status, 'DONE');
  assert.equal(normalized.sourceCreatedAt, null);
  assert.equal(normalized.sourceUpdatedAt, null);
});

test('normalization resolves sprint id from active sprint arrays, numeric ids, or fallback value', async () => {
  const normalizedFromArray = normalizeJiraIssue({
    key: 'SPM-217',
    fields: {
      summary: 'Resolve sprint from Jira sprint array',
      status: { name: 'In Review' },
      customfield_10020: [
        { id: 1001, state: 'closed' },
        { id: 1002, state: 'active' },
      ],
    },
  });

  assert.equal(normalizedFromArray.sprintId, '1002');
  assert.equal(normalizedFromArray.status, 'IN_REVIEW');

  const normalizedFromNumericSprint = normalizeJiraIssue({
    key: 'SPM-217A',
    fields: {
      summary: 'Resolve numeric sprint identifier',
      status: { name: 'In Review' },
      sprint: { id: 202603 },
    },
  });

  assert.equal(normalizedFromNumericSprint.sprintId, '202603');

  const normalizedWithFallback = normalizeJiraIssue({
    key: 'SPM-218',
    fields: {
      summary: 'Use fallback sprint id when Jira omits sprint data',
      status: { name: 'Backlog' },
    },
  }, {
    fallbackSprintId: 'sprint_2026_05',
  });

  assert.equal(normalizedWithFallback.sprintId, 'sprint_2026_05');
  assert.equal(normalizedWithFallback.storyPoints, null);
});

test('normalization does not fall back to assignee display fields when stable identifiers are missing', async () => {
  const normalized = normalizeJiraIssue({
    key: 'SPM-219',
    fields: {
      summary: 'Reject unstable assignee identifiers',
      description: 'Assignee has only display information.',
      status: { name: 'To Do' },
      assignee: {
        displayName: 'Student User',
        emailAddress: 'student@example.edu',
      },
      sprint: { id: 'sprint_2026_06' },
    },
  });

  assert.equal(normalized.assigneeId, null);
  assert.equal(normalized.reporterId, null);
  assert.equal(normalized.sprintId, 'sprint_2026_06');
});

test('normalization keeps required shape even when Jira issue payload is sparse', async () => {
  const normalized = normalizeJiraIssue({});

  assert.deepEqual(normalized, {
    issueKey: null,
    title: null,
    description: null,
    status: 'UNKNOWN',
    storyPoints: null,
    assigneeId: null,
    reporterId: null,
    sprintId: null,
    sourceCreatedAt: null,
    sourceUpdatedAt: null,
  });
});
