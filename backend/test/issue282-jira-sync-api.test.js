require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const sequelize = require('../db');
const app = require('../app');
const {
  Group,
  IntegrationBinding,
  IntegrationTokenReference,
  User,
} = require('../models');

let server;
let baseUrl;
const originalFetch = global.fetch;
const originalJiraEnv = {
  JIRA_BASE_URL: process.env.JIRA_BASE_URL,
  JIRA_USER_EMAIL: process.env.JIRA_USER_EMAIL,
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
};

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const json = await response.json();
  return { response, json };
}

async function createStudentUser({ email, fullName, studentId }) {
  return User.create({
    email,
    fullName,
    studentId,
    role: 'STUDENT',
    status: 'ACTIVE',
    password: 'StrongPass1!',
  });
}

async function authHeaderFor(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function createJiraReadyTeam({
  teamId = 'team-jira-sync',
  leader,
  includeTokenRef = true,
  providerSet = ['JIRA'],
} = {}) {
  const group = await Group.create({
    id: teamId,
    name: `Group ${teamId}`,
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
  });

  await IntegrationBinding.create({
    teamId,
    providerSet,
    organizationName: 'acme-org',
    repositoryName: 'senior-app-1',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    initiatedBy: String(leader.id),
    status: 'ACTIVE',
  });

  if (includeTokenRef) {
    await IntegrationTokenReference.create({
      teamId,
      jiraTokenRef: 'vault://jira/team-jira-sync',
    });
  }

  return group;
}

function setRealJiraEnv() {
  process.env.JIRA_BASE_URL = 'https://acme.atlassian.net';
  process.env.JIRA_USER_EMAIL = 'jira-bot@example.edu';
  process.env.JIRA_API_TOKEN = 'jira-api-token';
}

function resetJiraEnv() {
  Object.entries(originalJiraEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  });
}

test.before(async () => {
  await sequelize.sync({ force: true });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  resetJiraEnv();
  global.fetch = originalFetch;

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await sequelize.close();
});

test.beforeEach(async () => {
  global.fetch = originalFetch;
  resetJiraEnv();

  await IntegrationTokenReference.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
  await Group.destroy({ where: {} });
  await User.destroy({ where: {} });
});

test('team leader can trigger Jira sprint sync and receive an accepted response', async () => {
  const leader = await createStudentUser({
    email: 'jira-sync-leader@example.edu',
    fullName: 'Jira Sync Leader',
    studentId: '11070003001',
  });
  await createJiraReadyTeam({ leader });
  setRealJiraEnv();

  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith(baseUrl)) {
      return originalFetch(url, options);
    }

    fetchCalls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          issues: [
            {
              key: 'SPM-214',
              fields: {
                summary: 'Build Jira sync endpoint',
                status: { name: 'In Progress' },
                assignee: { accountId: 'stu_20230017' },
                sprint: { id: 'sprint_2026_03' },
                customfield_10016: 5,
              },
            },
            {
              key: 'SPM-215',
              fields: {
                summary: 'Normalize Jira responses',
                description: 'Use the issue normalizer in the sync flow.',
                status: { name: 'To Do' },
                sprint: { id: 'sprint_2026_03' },
              },
            },
          ],
        };
      },
    };
  };

  const { response, json } = await request('/api/v1/teams/team-jira-sync/sprints/sprint_2026_03/jira-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: String(leader.id),
      boardId: 'board_42',
      includeStatuses: ['To Do', 'In Progress'],
    }),
  });

  assert.equal(response.status, 202);
  assert.match(json.id, /^op_/);
  assert.equal(json.status, 'ACCEPTED');
  assert.equal(json.message, 'Jira sprint sync request accepted.');
  assert.equal(json.teamId, 'team-jira-sync');
  assert.equal(json.sprintId, 'sprint_2026_03');
  assert.equal(json.issueCount, 2);
  assert.equal(json.mock, false);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /board\/board_42\/sprint\/sprint_2026_03\/issue/);
  assert.match(fetchCalls[0].url, /status=To\+Do/);
  assert.match(fetchCalls[0].url, /status=In\+Progress/);
  assert.match(fetchCalls[0].options.headers.Authorization, /^Basic /);
});

test('team leader can trigger Jira sprint sync in mock mode when real Jira env config is absent', async () => {
  const leader = await createStudentUser({
    email: 'jira-sync-mock@example.edu',
    fullName: 'Jira Sync Mock',
    studentId: '11070003002',
  });
  await createJiraReadyTeam({ leader, teamId: 'team-jira-mock' });

  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith(baseUrl)) {
      return originalFetch(url, options);
    }

    fetchCalls.push({ url, options });
    throw new Error('External fetch should not run in mock mode');
  };

  const { response, json } = await request('/api/v1/teams/team-jira-mock/sprints/sprint_2026_04/jira-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: String(leader.id),
      boardId: 'board_77',
    }),
  });

  assert.equal(response.status, 202);
  assert.equal(json.status, 'ACCEPTED');
  assert.equal(json.issueCount, 0);
  assert.equal(json.mock, true);
  assert.equal(fetchCalls.length, 0);
});

test('jira sync rejects invalid request bodies', async () => {
  const leader = await createStudentUser({
    email: 'jira-sync-invalid@example.edu',
    fullName: 'Jira Sync Invalid',
    studentId: '11070003003',
  });
  await createJiraReadyTeam({ leader, teamId: 'team-jira-invalid' });

  const { response, json } = await request('/api/v1/teams/team-jira-invalid/sprints/sprint_2026_05/jira-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: '   ',
      boardId: '',
      includeStatuses: [''],
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(json.code, 'VALIDATION_ERROR');
  assert.equal(json.success, false);
  assert.ok(Array.isArray(json.details));
});

test('jira sync is limited to the team leader', async () => {
  const leader = await createStudentUser({
    email: 'jira-sync-owner@example.edu',
    fullName: 'Jira Sync Owner',
    studentId: '11070003004',
  });
  const member = await createStudentUser({
    email: 'jira-sync-member@example.edu',
    fullName: 'Jira Sync Member',
    studentId: '11070003005',
  });
  const group = await createJiraReadyTeam({ leader, teamId: 'team-jira-restricted' });

  await Group.update(
    { memberIds: [String(leader.id), String(member.id)] },
    { where: { id: group.id } },
  );

  const { response, json } = await request('/api/v1/teams/team-jira-restricted/sprints/sprint_2026_06/jira-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(member)),
    },
    body: JSON.stringify({
      requestedBy: String(member.id),
      boardId: 'board_99',
    }),
  });

  assert.equal(response.status, 403);
  assert.equal(json.code, 'FORBIDDEN');
});

test('jira sync returns 404 when no integration binding exists for the team', async () => {
  const leader = await createStudentUser({
    email: 'jira-sync-missing-binding@example.edu',
    fullName: 'Jira Sync Missing Binding',
    studentId: '11070003006',
  });

  await Group.create({
    id: 'team-jira-unbound',
    name: 'Group team-jira-unbound',
    leaderId: String(leader.id),
    memberIds: [String(leader.id)],
    maxMembers: 4,
  });

  const { response, json } = await request('/api/v1/teams/team-jira-unbound/sprints/sprint_2026_07/jira-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: String(leader.id),
      boardId: 'board_42',
    }),
  });

  assert.equal(response.status, 404);
  assert.equal(json.code, 'INTEGRATION_BINDING_NOT_FOUND');
});

test('jira sync returns 409 when the team has no Jira token reference', async () => {
  const leader = await createStudentUser({
    email: 'jira-sync-no-token@example.edu',
    fullName: 'Jira Sync No Token',
    studentId: '11070003007',
  });
  await createJiraReadyTeam({
    leader,
    teamId: 'team-jira-no-token',
    includeTokenRef: false,
  });

  const { response, json } = await request('/api/v1/teams/team-jira-no-token/sprints/sprint_2026_08/jira-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: String(leader.id),
      boardId: 'board_42',
    }),
  });

  assert.equal(response.status, 409);
  assert.equal(json.code, 'JIRA_TOKEN_REFERENCE_NOT_FOUND');
});

test('jira sync returns 502 when the Jira fetch fails', async () => {
  const leader = await createStudentUser({
    email: 'jira-sync-fetch-failure@example.edu',
    fullName: 'Jira Sync Fetch Failure',
    studentId: '11070003008',
  });
  await createJiraReadyTeam({ leader, teamId: 'team-jira-fetch-failure' });
  setRealJiraEnv();

  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith(baseUrl)) {
      return originalFetch(url, options);
    }

    return {
      ok: false,
      status: 503,
      async json() {
        return { message: 'Service unavailable' };
      },
    };
  };

  const { response, json } = await request('/api/v1/teams/team-jira-fetch-failure/sprints/sprint_2026_09/jira-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(leader)),
    },
    body: JSON.stringify({
      requestedBy: String(leader.id),
      boardId: 'board_42',
    }),
  });

  assert.equal(response.status, 502);
  assert.equal(json.code, 'JIRA_SYNC_FAILED');
});
