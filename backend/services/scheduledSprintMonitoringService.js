const { IntegrationBinding, IntegrationTokenReference } = require('../models');
const { normalizeJiraIssue } = require('./jiraIssueNormalizer');
const { syncGitHubPullRequests } = require('./githubSprintSyncService');
const { fetchJiraSprintIssues } = require('./jiraSprintSyncService');
const { storeJiraIssues, hasProvider } = require('./sprintMonitoringPersistenceService');

function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function asPositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function groupIssuesBySprintId(rawIssues) {
  const groups = new Map();

  for (const issue of rawIssues) {
    const normalized = normalizeJiraIssue(issue);
    if (!normalized.sprintId || !normalized.issueKey) {
      continue;
    }

    const existing = groups.get(normalized.sprintId) || [];
    existing.push(issue);
    groups.set(normalized.sprintId, existing);
  }

  return groups;
}

async function refreshBindingSprintMonitoring(binding, tokenReference, options = {}) {
  const includeStatuses = Array.isArray(options.includeStatuses)
    ? options.includeStatuses
    : undefined;

  if (!hasProvider(binding, 'JIRA') || !hasProvider(binding, 'GITHUB')) {
    return {
      teamId: binding.teamId,
      skipped: true,
      reason: 'BOTH_PROVIDERS_REQUIRED',
    };
  }

  if (!asTrimmedString(tokenReference?.jiraTokenRef) || !asTrimmedString(tokenReference?.githubTokenRef)) {
    return {
      teamId: binding.teamId,
      skipped: true,
      reason: 'TOKEN_REFERENCES_MISSING',
    };
  }

  const rawIssues = await fetchJiraSprintIssues({
    binding,
    tokenReference,
    projectKey: binding.jiraProjectKey,
    includeStatuses,
  });
  const issuesBySprint = groupIssuesBySprintId(rawIssues);
  const sprintSummaries = [];

  for (const [sprintId, issues] of issuesBySprint.entries()) {
    const persistedStories = await storeJiraIssues({
      teamId: binding.teamId,
      sprintId,
      issues,
    });
    const issueKeys = persistedStories.normalizedIssues
      .map((issue) => issue.issueKey)
      .filter(Boolean);
    const persistedPullRequests = await syncGitHubPullRequests({
      binding,
      tokenReference,
      teamId: binding.teamId,
      sprintId,
      issueKeys,
    });

    sprintSummaries.push({
      sprintId,
      storedStoryCount: persistedStories.storedStoryCount,
      storedPullRequestCount: persistedPullRequests.storedPullRequestCount,
    });
  }

  return {
    teamId: binding.teamId,
    skipped: false,
    sprintCount: sprintSummaries.length,
    sprintSummaries,
  };
}

async function refreshAllTeamSprintMonitoring(options = {}) {
  const bindings = await IntegrationBinding.findAll({
    where: { status: 'ACTIVE' },
    order: [['teamId', 'ASC']],
  });

  const results = [];
  for (const binding of bindings) {
    const tokenReference = await IntegrationTokenReference.findByPk(binding.teamId);

    try {
      const result = await refreshBindingSprintMonitoring(binding, tokenReference, options);
      results.push(result);
    } catch (error) {
      console.error('Scheduled sprint monitoring refresh failed for team', {
        teamId: binding.teamId,
        error: error.message,
      });
      results.push({
        teamId: binding.teamId,
        skipped: false,
        failed: true,
        reason: error.code || 'REFRESH_FAILED',
        message: error.message,
      });
    }
  }

  return {
    refreshedAt: new Date().toISOString(),
    teamCount: bindings.length,
    results,
  };
}

function createScheduledSprintMonitoringRefresher(options = {}) {
  const enabled = String(
    options.enabled ?? process.env.SPRINT_MONITORING_REFRESH_ENABLED ?? 'false',
  ).toLowerCase() === 'true';
  const intervalMs = asPositiveInteger(
    options.intervalMs ?? process.env.SPRINT_MONITORING_REFRESH_INTERVAL_MS,
    24 * 60 * 60 * 1000,
  );
  const runOnStartup = String(
    options.runOnStartup ?? process.env.SPRINT_MONITORING_REFRESH_RUN_ON_STARTUP ?? 'false',
  ).toLowerCase() === 'true';
  const includeStatuses = Array.isArray(options.includeStatuses)
    ? options.includeStatuses
    : undefined;

  let timer = null;
  let running = false;

  async function runOnce() {
    if (running) {
      return null;
    }

    running = true;
    try {
      const result = await refreshAllTeamSprintMonitoring({ includeStatuses });
      console.info('Scheduled sprint monitoring refresh completed', {
        teamCount: result.teamCount,
        refreshedAt: result.refreshedAt,
      });
      return result;
    } finally {
      running = false;
    }
  }

  function start() {
    if (!enabled || timer) {
      return;
    }

    if (runOnStartup) {
      runOnce().catch((error) => {
        console.error('Initial scheduled sprint monitoring refresh failed', error);
      });
    }

    timer = setInterval(() => {
      runOnce().catch((error) => {
        console.error('Scheduled sprint monitoring refresh failed', error);
      });
    }, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    enabled,
    intervalMs,
    runOnce,
    start,
    stop,
  };
}

module.exports = {
  createScheduledSprintMonitoringRefresher,
  refreshAllTeamSprintMonitoring,
  refreshBindingSprintMonitoring,
};
