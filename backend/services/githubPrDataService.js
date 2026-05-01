const {
  IntegrationBinding,
  IntegrationTokenReference,
} = require('../models');
const {
  getPullRequestsByBranch,
  getPullRequestsByIssueKeys,
  getCompletePullRequestData,
  verifyToken,
} = require('./githubApiClientService');
const ApiError = require('../errors/apiError');

async function getTeamGitHubConfig(teamId) {
  if (!teamId) {
    throw ApiError.badRequest('INVALID_TEAM_ID', 'Team ID is required');
  }

  const binding = await IntegrationBinding.findOne({
    where: { teamId },
  });

  if (!binding) {
    throw ApiError.notFound(
      'INTEGRATION_NOT_FOUND',
      'No GitHub integration configured for this team'
    );
  }

  if (!binding.providerSet.includes('GITHUB')) {
    throw ApiError.badRequest(
      'GITHUB_NOT_CONFIGURED',
      'GitHub is not configured for this team'
    );
  }

  const tokenRef = await IntegrationTokenReference.findByPk(teamId);

  if (!tokenRef?.githubTokenRef) {
    throw ApiError.badRequest(
      'GITHUB_TOKEN_NOT_FOUND',
      'GitHub token not configured for this team'
    );
  }

  return {
    teamId: binding.teamId,
    organizationName: binding.organizationName,
    repositoryName: binding.repositoryName,
    defaultBranch: binding.defaultBranch,
    githubTokenRef: tokenRef.githubTokenRef,
    status: binding.status,
  };
}

async function getPullRequestsByBranchesForTeam(teamId, branchNames) {
  try {
    if (!Array.isArray(branchNames) || branchNames.length === 0) {
      return [];
    }

    const config = await getTeamGitHubConfig(teamId);
    const prDataList = [];

    for (const branchName of branchNames) {
      try {
        const prs = await getPullRequestsByBranch(
          config.githubTokenRef,
          config.organizationName,
          config.repositoryName,
          branchName
        );

        for (const pr of prs) {
          try {
            const prData = await getCompletePullRequestData(
              config.githubTokenRef,
              config.organizationName,
              config.repositoryName,
              pr.number
            );
            prDataList.push(prData);
          } catch (prError) {
            console.warn(`Failed to fetch complete data for PR #${pr.number}:`, prError);
          }
        }
      } catch (branchError) {
        console.warn(`Failed to fetch PRs for branch ${branchName}:`, branchError);
      }
    }

    return prDataList;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.internal('Failed to fetch pull requests by branches');
  }
}

async function getPullRequestsByIssueKeysForTeam(teamId, issueKeys) {
  try {
    if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
      return [];
    }

    const config = await getTeamGitHubConfig(teamId);
    const prs = await getPullRequestsByIssueKeys(
      config.githubTokenRef,
      config.organizationName,
      config.repositoryName,
      issueKeys
    );

    const prDataList = [];

    for (const pr of prs) {
      try {
        const prData = await getCompletePullRequestData(
          config.githubTokenRef,
          config.organizationName,
          config.repositoryName,
          pr.number
        );
        prDataList.push(prData);
      } catch (prError) {
        console.warn(`Failed to fetch complete data for PR #${pr.number}:`, prError);
      }
    }

    return prDataList;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.internal('Failed to fetch pull requests by issue keys');
  }
}

async function getTeamPullRequestData(teamId, options = {}) {
  try {
    const { branchNames = [], issueKeys = [] } = options;

    const [branchPRs, issuePRs] = await Promise.all([
      getPullRequestsByBranchesForTeam(teamId, branchNames),
      getPullRequestsByIssueKeysForTeam(teamId, issueKeys),
    ]);

    // Deduplicate by PR number
    const prMap = new Map();

    for (const pr of branchPRs) {
      prMap.set(pr.prNumber, pr);
    }

    for (const pr of issuePRs) {
      if (!prMap.has(pr.prNumber)) {
        prMap.set(pr.prNumber, pr);
      }
    }

    return Array.from(prMap.values());
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.internal('Failed to fetch team pull request data');
  }
}

async function verifyTeamGitHubToken(teamId) {
  try {
    const config = await getTeamGitHubConfig(teamId);
    return await verifyToken(config.githubTokenRef);
  } catch (error) {
    return false;
  }
}

module.exports = {
  getTeamGitHubConfig,
  getPullRequestsByBranchesForTeam,
  getPullRequestsByIssueKeysForTeam,
  getTeamPullRequestData,
  verifyTeamGitHubToken,
};
