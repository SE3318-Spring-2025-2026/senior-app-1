require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const sequelize = require('../db');
const { IntegrationBinding, StoryMetric } = require('../models');

test.before(async () => {
  await sequelize.sync({ force: true });
});

test.after(async () => {
  await sequelize.close();
});

test.beforeEach(async () => {
  await StoryMetric.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
});

async function createTeamBinding(teamId = 'team_01HR9W2Q6NQ7G6M3K4J8') {
  return IntegrationBinding.create({
    teamId,
    providerSet: ['jira'],
    organizationName: 'senior-project',
    repositoryName: 'senior-app-1',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    initiatedBy: 'student-1',
    status: 'ACTIVE',
  });
}

test('story metric model stores required sprint story metrics for evaluation queries', async () => {
  await createTeamBinding();

  const metric = await StoryMetric.create({
    teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
    sprintId: 'sprint_2026_03',
    issueKey: 'SPM-214',
    metricName: 'storyCompletionScore',
    metricValue: 0.85,
    unit: 'ratio',
  });

  assert.equal(metric.teamId, 'team_01HR9W2Q6NQ7G6M3K4J8');
  assert.equal(metric.sprintId, 'sprint_2026_03');
  assert.equal(metric.issueKey, 'SPM-214');

  const sprintMetrics = await StoryMetric.findAll({
    where: {
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
    },
  });

  assert.equal(sprintMetrics.length, 1);
  assert.equal(sprintMetrics[0].metricValue, 0.85);
});

test('story metric model rejects missing required fields and invalid metric values', async () => {
  await createTeamBinding();

  await assert.rejects(
    StoryMetric.create({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      issueKey: 'SPM-214',
      metricName: 'storyCompletionScore',
      metricValue: -1,
      unit: 'ratio',
    }),
    /Validation/,
  );

  await assert.rejects(
    StoryMetric.create({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      issueKey: 'SPM-214',
      metricName: 'storyCompletionScore',
      metricValue: 0.85,
    }),
    /notNull Violation/,
  );
});

test('story metric model keeps one value per team sprint issue metric name', async () => {
  await createTeamBinding();

  const payload = {
    teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
    sprintId: 'sprint_2026_03',
    issueKey: 'SPM-214',
    metricName: 'storyCompletionScore',
    metricValue: 0.85,
    unit: 'ratio',
  };

  await StoryMetric.create(payload);

  await assert.rejects(
    StoryMetric.create({
      ...payload,
      metricValue: 0.95,
    }),
    /UniqueConstraintError|Validation error/,
  );
});
