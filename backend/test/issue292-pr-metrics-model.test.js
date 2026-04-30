require('./setupTestEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const sequelize = require('../db');
const { IntegrationBinding, PrMetric } = require('../models');

test.before(async () => {
  await sequelize.sync({ force: true });
});

test.after(async () => {
  await sequelize.close();
});

test.beforeEach(async () => {
  await PrMetric.destroy({ where: {} });
  await IntegrationBinding.destroy({ where: {} });
});

async function createTeamBinding(teamId = 'team_01HR9W2Q6NQ7G6M3K4J8') {
  return IntegrationBinding.create({
    teamId,
    providerSet: ['github'],
    organizationName: 'senior-project',
    repositoryName: 'senior-app-1',
    jiraWorkspaceId: 'workspace-acme',
    jiraProjectKey: 'SPM',
    defaultBranch: 'main',
    initiatedBy: 'student-1',
    status: 'ACTIVE',
  });
}

test('PR metric model stores required sprint PR metrics for evaluation queries', async () => {
  await createTeamBinding();

  const metric = await PrMetric.create({
    teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
    sprintId: 'sprint_2026_03',
    prNumber: 142,
    metricName: 'reviewReadinessScore',
    metricValue: 0.92,
    unit: 'ratio',
  });

  assert.equal(metric.teamId, 'team_01HR9W2Q6NQ7G6M3K4J8');
  assert.equal(metric.sprintId, 'sprint_2026_03');
  assert.equal(metric.prNumber, 142);

  const sprintMetrics = await PrMetric.findAll({
    where: {
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
    },
  });

  assert.equal(sprintMetrics.length, 1);
  assert.equal(sprintMetrics[0].metricValue, 0.92);
});

test('PR metric model rejects missing required fields and invalid metric values', async () => {
  await createTeamBinding();

  await assert.rejects(
    PrMetric.create({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      prNumber: 142,
      metricName: '',
      metricValue: 0.92,
      unit: 'ratio',
    }),
    /Validation/,
  );

  await assert.rejects(
    PrMetric.create({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      prNumber: 142,
      metricName: 'reviewReadinessScore',
      metricValue: -1,
      unit: 'ratio',
    }),
    /Validation/,
  );

  await assert.rejects(
    PrMetric.create({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      prNumber: 0,
      metricName: 'reviewReadinessScore',
      metricValue: 0.92,
      unit: 'ratio',
    }),
    /Validation/,
  );

  await assert.rejects(
    PrMetric.create({
      teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
      sprintId: 'sprint_2026_03',
      prNumber: 142,
      metricName: 'reviewReadinessScore',
      metricValue: 0.92,
    }),
    /notNull Violation/,
  );
});

test('PR metric model keeps one value per team sprint PR metric name', async () => {
  await createTeamBinding();

  const payload = {
    teamId: 'team_01HR9W2Q6NQ7G6M3K4J8',
    sprintId: 'sprint_2026_03',
    prNumber: 142,
    metricName: 'reviewReadinessScore',
    metricValue: 0.92,
    unit: 'ratio',
  };

  await PrMetric.create(payload);

  await assert.rejects(
    PrMetric.create({
      ...payload,
      metricValue: 0.95,
    }),
    /UniqueConstraintError|Validation error/,
  );
});

test('PR metric model requires an existing integration binding and supports eager loading', async () => {
  await assert.rejects(
    PrMetric.create({
      teamId: 'missing-team',
      sprintId: 'sprint_2026_03',
      prNumber: 142,
      metricName: 'reviewReadinessScore',
      metricValue: 0.92,
      unit: 'ratio',
    }),
    /ForeignKeyConstraintError/,
  );

  await createTeamBinding('team_assoc');
  await PrMetric.create({
    teamId: 'team_assoc',
    sprintId: 'sprint_2026_03',
    prNumber: 142,
    metricName: 'reviewReadinessScore',
    metricValue: 0.92,
    unit: 'ratio',
  });

  const binding = await IntegrationBinding.findOne({
    where: { teamId: 'team_assoc' },
    include: 'prMetrics',
  });

  assert.equal(binding.prMetrics.length, 1);
  assert.equal(binding.prMetrics[0].prNumber, 142);
});
