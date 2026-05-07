require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildJiraAuthHeader,
  buildJiraProjectOpenSprintIssuesRequest,
  buildJiraRequest,
  buildJiraSprintIssuesRequest,
  hasRealJiraApiConfig,
  normalizeJiraBaseUrl,
} = require('../services/jiraRequestBuilder');

test('builds Jira basic auth headers from explicit credentials', async () => {
  const header = buildJiraAuthHeader({
    email: 'jira-user@example.edu',
    apiToken: 'secret-token',
  });

  assert.equal(
    header,
    `Basic ${Buffer.from('jira-user@example.edu:secret-token').toString('base64')}`,
  );
});

test('builds configurable Jira requests with query params and JSON body', async () => {
  const request = buildJiraRequest({
    path: '/rest/api/3/search/jql',
    method: 'post',
    query: {
      expand: 'names',
      fields: ['summary', 'status'],
      maxResults: 50,
      ignored: '',
    },
    headers: {
      'x-trace-id': 'trace-123',
    },
    body: {
      jql: 'project = SPM',
    },
  }, {
    baseUrl: 'https://acme.atlassian.net',
    email: 'jira-user@example.edu',
    apiToken: 'secret-token',
  });

  const url = new URL(request.url);
  assert.equal(url.origin, 'https://acme.atlassian.net');
  assert.equal(url.pathname, '/rest/api/3/search/jql');
  assert.deepEqual(url.searchParams.getAll('fields'), ['summary', 'status']);
  assert.equal(url.searchParams.get('expand'), 'names');
  assert.equal(url.searchParams.get('maxResults'), '50');
  assert.equal(url.searchParams.get('ignored'), null);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Accept, 'application/json');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.equal(request.options.headers['x-trace-id'], 'trace-123');
  assert.ok(request.options.headers.Authorization?.startsWith('Basic '));
  assert.equal(request.options.body, JSON.stringify({ jql: 'project = SPM' }));
  assert.equal(request.mock, false);
});

test('normalizes base url and reports mock mode when real Jira config is absent', async () => {
  assert.equal(normalizeJiraBaseUrl('https://acme.atlassian.net'), 'https://acme.atlassian.net/');
  assert.equal(normalizeJiraBaseUrl('  '), 'https://mocked-jira.local/');
  assert.equal(hasRealJiraApiConfig({
    baseUrl: 'https://acme.atlassian.net',
    email: '',
    apiToken: 'secret-token',
  }), false);

  const request = buildJiraRequest({
    path: '/rest/api/3/project/SPM',
  }, {
    baseUrl: '',
    email: '',
    apiToken: '',
  });

  assert.equal(request.mock, true);
  assert.equal(request.url, 'https://mocked-jira.local/rest/api/3/project/SPM');
  assert.equal(request.options.headers.Authorization, undefined);
});

test('builds sprint issue requests in a configurable form that can be reused by later Jira sync issues', async () => {
  const request = buildJiraSprintIssuesRequest({
    boardId: 'board_42',
    sprintId: 'sprint_2026_03',
    includeStatuses: ['To Do', 'In Progress', ''],
  }, {
    baseUrl: 'https://acme.atlassian.net',
    email: 'jira-user@example.edu',
    apiToken: 'secret-token',
    fields: ['summary', 'customfield_story_points', 'customfield_sprint_ref'],
    maxResults: 25,
  });

  const url = new URL(request.url);
  assert.equal(
    url.pathname,
    '/rest/agile/1.0/board/board_42/sprint/sprint_2026_03/issue',
  );
  assert.equal(url.searchParams.get('maxResults'), '25');
  assert.equal(
    url.searchParams.get('fields'),
    'summary,customfield_story_points,customfield_sprint_ref',
  );
  assert.deepEqual(url.searchParams.getAll('status'), ['To Do', 'In Progress']);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.mock, false);
});

test('builds open sprint issue search requests from Jira project key for scheduled refresh', async () => {
  const request = buildJiraProjectOpenSprintIssuesRequest({
    projectKey: 'spm',
    includeStatuses: ['To Do', 'In Progress'],
  }, {
    baseUrl: 'https://acme.atlassian.net',
    email: 'jira-user@example.edu',
    apiToken: 'secret-token',
    fields: ['summary', 'status', 'customfield_10020'],
    maxResults: 25,
  });

  assert.equal(request.url, 'https://acme.atlassian.net/rest/api/3/search/jql');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.mock, false);

  const body = JSON.parse(request.options.body);
  assert.match(body.jql, /project = "SPM"/);
  assert.match(body.jql, /sprint in openSprints\(\)/);
  assert.match(body.jql, /status IN \("To Do", "In Progress"\)/);
  assert.deepEqual(body.fields, ['summary', 'status', 'customfield_10020']);
  assert.equal(body.maxResults, 25);
});

test('rejects invalid or unsafe builder input early', async () => {
  assert.throws(
    () => buildJiraRequest({}, {
      baseUrl: 'https://acme.atlassian.net',
      email: 'jira-user@example.edu',
      apiToken: 'secret-token',
    }),
    /Jira request path is required/,
  );

  assert.throws(
    () => buildJiraRequest({
      path: 'https://attacker.tld/rest/api/3/search',
    }, {
      baseUrl: 'https://acme.atlassian.net',
      email: 'jira-user@example.edu',
      apiToken: 'secret-token',
    }),
    /Jira request path must be relative/,
  );

  assert.throws(
    () => buildJiraSprintIssuesRequest({
      boardId: '',
      sprintId: 'sprint_2026_03',
    }),
    /boardId is required/,
  );

  assert.throws(
    () => buildJiraSprintIssuesRequest({
      boardId: 'board_42',
      sprintId: '',
    }),
    /sprintId is required/,
  );

  assert.throws(
    () => buildJiraProjectOpenSprintIssuesRequest({
      projectKey: 'spm"',
      includeStatuses: ['Done'],
    }),
    /projectKey must contain only uppercase letters, numbers, underscores, or hyphens/,
  );
});

test('escapes status values when building open sprint JQL', async () => {
  const request = buildJiraProjectOpenSprintIssuesRequest({
    projectKey: 'SPM',
    includeStatuses: ['Needs "Review"', 'Done\\QA'],
  });

  const body = JSON.parse(request.options.body);
  assert.match(body.jql, /status IN \("Needs \\"Review\\"", "Done\\\\QA"\)/);
});
