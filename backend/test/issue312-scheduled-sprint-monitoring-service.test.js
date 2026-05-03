require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const sequelize = require('../db');
const {
  IntegrationBinding,
  IntegrationTokenReference,
  SprintPullRequest,
  SprintStory,
} = require('../models');
const {
  createScheduledSprintMonitoringRefresher,
  refreshAllTeamSprintMonitoring,
} = require('../services/scheduledSprintMonitoringService');

const originalFetch = global.fetch;

function setTokenEnv(prefix, tokenRef, secretValue) {
  const key = `${prefix}_${String(tokenRef)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()}`;
  process.env[key] = secretValue;
}

test.before(async () => {
  await sequelize.sync({ force: true });
});

test.after(async () => {
  global.fetch = originalFetch;
  await sequelize.close();
});

test.beforeEach(async () => {
  global.fetch = originalFetch;
  process.env.JIRA_USER_EMAIL = 'jira-scheduler@example.edu';

  await SprintPullRequest.destroy({ where: {} });
  await SprintStory.destroy({ where: {} });
  await IntegrationTokenReference.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
});

test('scheduled refresh synchronizes active sprint Jira issues and matching GitHub pull requests', async () => {
  await IntegrationBinding.create({
    teamId: 'team-scheduler',
    providerSet: ['GITHUB', 'JIRA'],
    organizationName: 'acme-org',
    repositoryName: 'senior-app-1',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    defaultBranch: 'main',
    initiatedBy: 'student-1',
    status: 'ACTIVE',
  });

  await IntegrationTokenReference.create({
    teamId: 'team-scheduler',
    jiraTokenRef: 'vault://jira/team-scheduler',
    githubTokenRef: 'vault://github/team-scheduler',
  });

  setTokenEnv('JIRA_TOKEN_REF', 'vault://jira/team-scheduler', 'jira-secret');
  setTokenEnv('GITHUB_TOKEN_REF', 'vault://github/team-scheduler', 'github-secret');

  global.fetch = async (url, options = {}) => {
    const normalizedUrl = String(url);

    if (normalizedUrl.includes('/rest/api/3/search')) {
      assert.match(String(options?.headers?.Authorization || ''), /^Basic /);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          issues: [
            {
              key: 'SPM-214',
              fields: {
                summary: 'Scheduled login validation sync',
                status: { name: 'In Progress' },
                assignee: { accountId: 'student-11' },
                reporter: { accountId: 'advisor-2' },
                customfield_10016: 5,
                customfield_10020: [{ id: 'sprint-open-1', state: 'active' }],
              },
            },
          ],
        }),
      };
    }

    if (normalizedUrl.endsWith('/pulls?state=all&per_page=100&page=1')) {
      assert.match(String(options?.headers?.Authorization || ''), /^token /);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([
          {
            number: 42,
            title: 'SPM-214 Fix login validation',
            body: 'Implements monitoring flow',
            head: { ref: 'SPM-214-login-validation' },
          },
        ]),
      };
    }

    if (normalizedUrl.endsWith('/pulls?state=all&per_page=100&page=2')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([]),
      };
    }

    if (normalizedUrl.endsWith('/pulls/42')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          number: 42,
          title: 'SPM-214 Fix login validation',
          body: 'Implements monitoring flow',
          state: 'open',
          merged: false,
          mergeable_state: 'clean',
          head: { ref: 'SPM-214-login-validation' },
          html_url: 'https://github.com/acme-org/senior-app-1/pull/42',
          created_at: '2026-05-02T10:00:00Z',
          updated_at: '2026-05-02T10:30:00Z',
          merged_at: null,
          additions: 10,
          deletions: 2,
          changed_files: 1,
        }),
      };
    }

    if (normalizedUrl.endsWith('/pulls/42/files?per_page=100')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([
          {
            filename: 'backend/controllers/authController.js',
            status: 'modified',
            additions: 10,
            deletions: 2,
            changes: 12,
          },
        ]),
      };
    }

    throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
  };

  const result = await refreshAllTeamSprintMonitoring();

  assert.equal(result.teamCount, 1);
  assert.equal(result.results[0].teamId, 'team-scheduler');
  assert.equal(result.results[0].sprintCount, 1);
  assert.equal(result.results[0].sprintSummaries[0].sprintId, 'sprint-open-1');
  assert.equal(await SprintStory.count(), 1);
  assert.equal(await SprintPullRequest.count(), 1);
});

test('scheduled refresher exposes config and can be disabled cleanly', async () => {
  const refresher = createScheduledSprintMonitoringRefresher({
    enabled: false,
    intervalMs: 5000,
    runOnStartup: true,
  });

  assert.equal(refresher.enabled, false);
  assert.equal(refresher.intervalMs, 5000);
  refresher.start();
  refresher.stop();
});

test('scheduled refresh bulk-loads token references for active bindings', async () => {
  await IntegrationBinding.bulkCreate([
    {
      teamId: 'team-token-bulk-1',
      providerSet: ['GITHUB', 'JIRA'],
      organizationName: 'acme-org',
      repositoryName: 'senior-app-1',
      jiraWorkspaceId: 'workspace-acme',
      jiraProjectKey: 'SPM',
      defaultBranch: 'main',
      initiatedBy: 'student-1',
      status: 'ACTIVE',
    },
    {
      teamId: 'team-token-bulk-2',
      providerSet: ['GITHUB', 'JIRA'],
      organizationName: 'acme-org',
      repositoryName: 'senior-app-1',
      jiraWorkspaceId: 'workspace-acme',
      jiraProjectKey: 'SPM',
      defaultBranch: 'main',
      initiatedBy: 'student-2',
      status: 'ACTIVE',
    },
  ]);

  await IntegrationTokenReference.bulkCreate([
    {
      teamId: 'team-token-bulk-1',
      jiraTokenRef: 'vault://jira/team-token-bulk-1',
      githubTokenRef: 'vault://github/team-token-bulk-1',
    },
    {
      teamId: 'team-token-bulk-2',
      jiraTokenRef: 'vault://jira/team-token-bulk-2',
      githubTokenRef: 'vault://github/team-token-bulk-2',
    },
  ]);

  const originalFindAll = IntegrationTokenReference.findAll;
  const originalFindByPk = IntegrationTokenReference.findByPk;
  let findAllCount = 0;
  let findByPkCount = 0;

  IntegrationTokenReference.findAll = async (...args) => {
    findAllCount += 1;
    return originalFindAll.apply(IntegrationTokenReference, args);
  };
  IntegrationTokenReference.findByPk = async (...args) => {
    findByPkCount += 1;
    return originalFindByPk.apply(IntegrationTokenReference, args);
  };

  try {
    const result = await refreshAllTeamSprintMonitoring();

    assert.equal(result.teamCount, 2);
    assert.equal(findAllCount, 1);
    assert.equal(findByPkCount, 0);
    assert.equal(result.results.every((entry) => entry.failed === true), true);
    assert.equal(
      result.results.every((entry) => entry.reason === 'JIRA_TOKEN_SECRET_NOT_RESOLVED'),
      true,
    );
  } finally {
    IntegrationTokenReference.findAll = originalFindAll;
    IntegrationTokenReference.findByPk = originalFindByPk;
  }
});
