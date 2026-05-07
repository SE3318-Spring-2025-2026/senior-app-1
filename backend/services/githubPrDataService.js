const ApiError = require('../errors/apiError');

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function inferIssueKey(branchName, issueKeys) {
  const branchIssueKey = branchName.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  if (branchIssueKey) {
    return branchIssueKey[1];
  }

  return issueKeys[0] || null;
}

async function getTeamPullRequestData(teamId, options = {}) {
  if (typeof teamId !== 'string' || teamId.trim().length === 0) {
    throw ApiError.badRequest('INVALID_TEAM_ID', 'teamId is required');
  }

  const branchNames = normalizeStringArray(options.branchNames);
  const issueKeys = normalizeStringArray(options.issueKeys);

  // Legacy compatibility shim:
  // this endpoint previously loaded PRs from GitHub directly, but the codebase
  // now prefers batch ingestion through githubPrDataIngestionController.
  // We keep the route alive by returning normalized placeholders for the
  // requested branches instead of crashing during app startup.
  return branchNames.map((branchName, index) => ({
    prNumber: null,
    issueKey: inferIssueKey(branchName, issueKeys.slice(index, index + 1).concat(issueKeys)),
    branchName,
    prStatus: 'UNKNOWN',
    mergeStatus: 'UNKNOWN',
    diffSummary: {
      additions: 0,
      deletions: 0,
      changedFilesCount: 0,
      totalChanges: 0,
      summary: 'PR data not fetched by legacy endpoint',
    },
    changedFiles: [],
    url: null,
    createdAt: null,
    updatedAt: null,
    mergedAt: null,
  }));
}

module.exports = {
  getTeamPullRequestData,
};
