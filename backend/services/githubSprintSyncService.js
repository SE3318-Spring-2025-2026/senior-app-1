const ApiError = require('../errors/apiError');
const { makeGitHubRequest } = require('./githubApiClientService');
const { extractIssueKeyFromText } = require('./githubPrDataNormalizer');
const { resolveTokenReference } = require('./tokenReferenceResolver');
const { storeGitHubPullRequests } = require('./sprintMonitoringPersistenceService');

function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => asTrimmedString(value))
    .filter(Boolean);
}

function assertHasFilters({ branchNames, issueKeys }) {
  if (branchNames.length > 0 || issueKeys.length > 0) {
    return;
  }

  throw ApiError.badRequest(
    'GITHUB_SYNC_FILTER_REQUIRED',
    'At least one branch name or related issue key is required to synchronize GitHub pull requests',
  );
}

function matchesFilters(pr, { branchNames, issueKeys }) {
  if (branchNames.length === 0 && issueKeys.length === 0) {
    return true;
  }

  const branchName = asTrimmedString(pr?.head?.ref);
  const searchableText = [
    pr?.title,
    pr?.body,
    branchName,
  ].map((value) => asTrimmedString(value)).filter(Boolean).join(' ');
  const inferredIssueKey = extractIssueKeyFromText(searchableText);

  const branchMatch = branchNames.length === 0 || branchNames.includes(branchName);
  const issueMatch = issueKeys.length === 0
    || issueKeys.some((issueKey) => searchableText.includes(issueKey))
    || issueKeys.includes(inferredIssueKey);

  return branchMatch && issueMatch;
}

async function fetchRepositoryPullRequests({ binding, tokenReference, branchNames = [], issueKeys = [] }) {
  const organizationName = asTrimmedString(binding?.organizationName);
  const repositoryName = asTrimmedString(binding?.repositoryName);
  if (!organizationName || !repositoryName) {
    throw ApiError.conflict(
      'GITHUB_REPOSITORY_NOT_CONFIGURED',
      'GitHub organization and repository must be configured for this team',
    );
  }

  const normalizedBranchNames = normalizeStringArray(branchNames);
  const normalizedIssueKeys = normalizeStringArray(issueKeys);
  assertHasFilters({
    branchNames: normalizedBranchNames,
    issueKeys: normalizedIssueKeys,
  });

  const githubToken = resolveTokenReference(tokenReference?.githubTokenRef, { provider: 'GITHUB' });
  const pulls = await makeGitHubRequest(
    githubToken,
    organizationName,
    repositoryName,
    `/repos/${organizationName}/${repositoryName}/pulls?state=all&per_page=100`,
  );

  const filteredPulls = Array.isArray(pulls)
    ? pulls.filter((pullRequest) => matchesFilters(pullRequest, {
      branchNames: normalizedBranchNames,
      issueKeys: normalizedIssueKeys,
    }))
    : [];

  const detailConcurrency = 5;
  const detailedPulls = [];
  for (let index = 0; index < filteredPulls.length; index += detailConcurrency) {
    const batch = filteredPulls.slice(index, index + detailConcurrency);
    const batchResults = await Promise.all(batch.map(async (pullRequest) => {
      const [detailedPullRequest, files] = await Promise.all([
        makeGitHubRequest(
          githubToken,
          organizationName,
          repositoryName,
          `/repos/${organizationName}/${repositoryName}/pulls/${pullRequest.number}`,
        ),
        makeGitHubRequest(
          githubToken,
          organizationName,
          repositoryName,
          `/repos/${organizationName}/${repositoryName}/pulls/${pullRequest.number}/files?per_page=100`,
        ),
      ]);

      return {
        pull_request: {
          ...detailedPullRequest,
          files: Array.isArray(files) ? files : [],
        },
      };
    }));
    detailedPulls.push(...batchResults);
  }

  return detailedPulls;
}

async function syncGitHubPullRequests({ binding, tokenReference, teamId, sprintId, branchNames = [], issueKeys = [] }) {
  const pullRequests = await fetchRepositoryPullRequests({
    binding,
    tokenReference,
    branchNames,
    issueKeys,
  });

  const persisted = await storeGitHubPullRequests({
    teamId,
    sprintId,
    pullRequests,
  });

  return {
    ...persisted,
    upstreamPullRequestCount: pullRequests.length,
  };
}

module.exports = {
  fetchRepositoryPullRequests,
  syncGitHubPullRequests,
};
