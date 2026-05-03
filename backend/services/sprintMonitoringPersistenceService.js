const sequelize = require('../db');
const ApiError = require('../errors/apiError');
const { SprintPullRequest, SprintStory } = require('../models');
const { normalizeJiraIssue } = require('./jiraIssueNormalizer');
const { normalizePullRequestData } = require('./githubPrDataNormalizer');

function hasProvider(binding, provider) {
  const normalizedProvider = String(provider || '').toUpperCase();
  const providers = Array.isArray(binding?.providerSet)
    ? binding.providerSet.map((entry) => String(entry).toUpperCase())
    : [];

  return providers.includes(normalizedProvider);
}

function findMissingRequiredFields(issue) {
  const missingFields = [];

  if (!issue.issueKey) {
    missingFields.push('issueKey');
  }
  if (!issue.title) {
    missingFields.push('title');
  }
  if (!issue.status || issue.status === 'UNKNOWN') {
    missingFields.push('status');
  }
  if (!issue.sprintId) {
    missingFields.push('sprintId');
  }

  return missingFields;
}

function findSprintMismatchIssues(issues, sprintId) {
  return issues
    .map((issue, index) => ({
      index,
      issueKey: issue.issueKey,
      sprintId: issue.sprintId,
    }))
    .filter((issue) => issue.sprintId !== sprintId);
}

async function storeJiraIssues({ teamId, sprintId, issues }) {
  const normalizedIssues = issues.map((issue) => normalizeJiraIssue(issue, {
    fallbackSprintId: sprintId,
  }));

  const invalidIssues = normalizedIssues
    .map((issue, index) => ({
      index,
      issueKey: issue.issueKey,
      missingFields: findMissingRequiredFields(issue),
    }))
    .filter((entry) => entry.missingFields.length > 0);

  if (invalidIssues.length > 0) {
    throw ApiError.badRequest(
      'VALIDATION_ERROR',
      'One or more Jira issues could not be normalized into the required shape',
      invalidIssues.map((entry) => ({
        msg: `Issue is missing required fields: ${entry.missingFields.join(', ')}`,
        path: `issues[${entry.index}]`,
        value: entry.issueKey ?? null,
      })),
    );
  }

  const sprintMismatchIssues = findSprintMismatchIssues(normalizedIssues, sprintId);
  if (sprintMismatchIssues.length > 0) {
    throw ApiError.badRequest(
      'VALIDATION_ERROR',
      'One or more Jira issues do not belong to the requested sprint',
      sprintMismatchIssues.map((issue) => ({
        msg: 'Issue sprintId does not match the request sprintId',
        path: `issues[${issue.index}]`,
        value: issue.issueKey ?? issue.sprintId,
      })),
    );
  }

  const uniqueIssueKeys = new Set(normalizedIssues.map((issue) => issue.issueKey));
  if (uniqueIssueKeys.size !== normalizedIssues.length) {
    throw ApiError.badRequest(
      'VALIDATION_ERROR',
      'Duplicate Jira issues in request payload',
    );
  }

  const storyRows = normalizedIssues.map((issue) => ({
    teamId,
    sprintId: issue.sprintId,
    issueKey: issue.issueKey,
    title: issue.title,
    description: issue.description,
    assigneeId: issue.assigneeId,
    reporterId: issue.reporterId,
    status: issue.status,
    storyPoints: issue.storyPoints,
    sourceCreatedAt: issue.sourceCreatedAt,
    sourceUpdatedAt: issue.sourceUpdatedAt,
  }));

  await sequelize.transaction(async (transaction) => {
    await SprintStory.bulkCreate(storyRows, {
      transaction,
      updateOnDuplicate: [
        'title',
        'description',
        'assigneeId',
        'reporterId',
        'status',
        'storyPoints',
        'sourceCreatedAt',
        'sourceUpdatedAt',
        'updatedAt',
      ],
    });
  });

  return {
    normalizedIssues,
    receivedCount: normalizedIssues.length,
    storedStoryCount: normalizedIssues.length,
  };
}

function extractPullRequestSource(sourcePayload) {
  if (!sourcePayload || typeof sourcePayload !== 'object') {
    return {};
  }

  return sourcePayload.pull_request && typeof sourcePayload.pull_request === 'object'
    ? sourcePayload.pull_request
    : sourcePayload.pullRequest && typeof sourcePayload.pullRequest === 'object'
      ? sourcePayload.pullRequest
      : sourcePayload;
}

async function storeGitHubPullRequests({ teamId, sprintId, pullRequests }) {
  const normalizedPullRequests = pullRequests.map(normalizePullRequestData);
  const invalidPullRequests = normalizedPullRequests
    .map((pullRequest, index) => ({
      index,
      prNumber: pullRequest.prNumber,
    }))
    .filter((pullRequest) => !pullRequest.prNumber);

  if (invalidPullRequests.length > 0) {
    throw ApiError.badRequest(
      'VALIDATION_ERROR',
      'One or more pull requests could not be normalized into the required shape',
      invalidPullRequests.map((pullRequest) => ({
        msg: 'Pull request number is required',
        path: `pullRequests[${pullRequest.index}]`,
        value: null,
      })),
    );
  }

  const seenPullRequestNumbers = new Set();
  const hasDuplicatePullRequestNumbers = normalizedPullRequests.some((pullRequest) => {
    if (seenPullRequestNumbers.has(pullRequest.prNumber)) {
      return true;
    }

    seenPullRequestNumbers.add(pullRequest.prNumber);
    return false;
  });

  if (hasDuplicatePullRequestNumbers) {
    throw ApiError.badRequest(
      'VALIDATION_ERROR',
      'Duplicate pull requests in request payload',
    );
  }

  const pullRequestRows = normalizedPullRequests.map((normalized, index) => {
    const source = extractPullRequestSource(pullRequests[index]);

    return {
      teamId,
      sprintId,
      prNumber: normalized.prNumber,
      relatedIssueKey: normalized.issueKey,
      branchName: normalized.branchName,
      title: typeof source.title === 'string' ? source.title.trim() || null : null,
      prStatus: normalized.prStatus,
      mergeStatus: normalized.mergeStatus,
      changedFiles: normalized.changedFiles,
      diffSummary: normalized.diffSummary,
      sourceCreatedAt: source.created_at || source.createdAt || null,
      sourceUpdatedAt: source.updated_at || source.updatedAt || null,
      sourceMergedAt: source.merged_at || source.mergedAt || null,
      url: source.html_url || source.url || null,
    };
  });

  await sequelize.transaction(async (transaction) => {
    await SprintPullRequest.bulkCreate(pullRequestRows, {
      transaction,
      updateOnDuplicate: [
        'relatedIssueKey',
        'branchName',
        'title',
        'prStatus',
        'mergeStatus',
        'changedFiles',
        'diffSummary',
        'sourceCreatedAt',
        'sourceUpdatedAt',
        'sourceMergedAt',
        'url',
        'updatedAt',
      ],
    });
  });

  return {
    normalizedPullRequests,
    receivedCount: normalizedPullRequests.length,
    storedPullRequestCount: normalizedPullRequests.length,
  };
}

module.exports = {
  hasProvider,
  storeGitHubPullRequests,
  storeJiraIssues,
};
