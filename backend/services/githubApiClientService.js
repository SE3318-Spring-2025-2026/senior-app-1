const fetch = global.fetch || require('node-fetch');
const ApiError = require('../errors/apiError');

/**
 * Make an authenticated request to GitHub API
 * @private
 */
async function makeGitHubRequest(token, organizationName, repositoryName, endpoint, options = {}) {
  if (!token) {
    throw ApiError.unauthorized('GITHUB_AUTHENTICATION_FAILED', 'Invalid or expired GitHub token');
  }

  const baseUrl = 'https://api.github.com';
  const url = `${baseUrl}${endpoint}`;
  
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `token ${token}`,
    'User-Agent': 'senior-app',
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Handle rate limiting
    if (response.status === 403) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        if (errorData.message && errorData.message.includes('API rate limit exceeded')) {
          const resetTime = response.headers.get('x-ratelimit-reset');
          throw ApiError.badRequest(
            'GITHUB_RATE_LIMIT_EXCEEDED',
            'GitHub API rate limit exceeded',
            { resetTime }
          );
        }
      }
    }

    // Handle authentication errors
    if (response.status === 401) {
      throw ApiError.unauthorized(
        'GITHUB_AUTHENTICATION_FAILED',
        'Invalid or expired GitHub token'
      );
    }

    // Handle not found
    if (response.status === 404) {
      throw ApiError.notFound(
        'GITHUB_RESOURCE_NOT_FOUND',
        'The requested GitHub resource was not found'
      );
    }

    // Handle server errors
    if (response.status >= 500) {
      throw ApiError.internal('GitHub API server error');
    }

    // Handle other client errors
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let errorMessage = 'GitHub API request failed';
      
      if (contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // Ignore parsing errors
        }
      }

      throw ApiError.badRequest('GITHUB_API_ERROR', errorMessage);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    return response.text();
  } catch (error) {
    // Re-throw API errors as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle network errors
    if (error.message && error.message.includes('fetch')) {
      throw ApiError.internal('Failed to connect to GitHub API');
    }

    throw error;
  }
}

/**
 * Fetch pull requests for a specific branch
 */
async function getPullRequestsByBranch(token, organizationName, repositoryName, branchName) {
  if (!branchName) {
    throw ApiError.badRequest('INVALID_BRANCH', 'Branch name is required');
  }

  try {
    const endpoint = `/repos/${organizationName}/${repositoryName}/pulls`;
    const response = await makeGitHubRequest(token, organizationName, repositoryName, endpoint);

    const filteredPRs = Array.isArray(response)
      ? response.filter(pr => pr.head?.ref === branchName)
      : [];

    return filteredPRs;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.internal(`Failed to fetch pull requests for branch ${branchName}`);
  }
}

/**
 * Get detailed PR data including diff information
 */
async function getPullRequestDetails(token, organizationName, repositoryName, prNumber) {
  if (!prNumber) {
    throw ApiError.badRequest('INVALID_PR_NUMBER', 'PR number is required');
  }

  try {
    const endpoint = `/repos/${organizationName}/${repositoryName}/pulls/${prNumber}`;
    const prData = await makeGitHubRequest(token, organizationName, repositoryName, endpoint);

    // Extract issue key from PR title or body
    const issueKeyMatch = (prData.title || '').match(/([A-Z]+-\d+)/);
    const issueKey = issueKeyMatch ? issueKeyMatch[1] : null;

    // Determine PR status
    const prStatus = prData.merged
      ? 'MERGED'
      : prData.draft
      ? 'DRAFT'
      : prData.state === 'closed'
      ? 'CLOSED'
      : 'OPEN';

    // Determine merge status
    const mergeStatus = prData.merged
      ? 'MERGED'
      : prData.mergeable === false
      ? 'MERGE_CONFLICT'
      : prData.mergeable === true
      ? 'MERGEABLE'
      : 'UNKNOWN';

    return {
      prNumber: prData.number,
      issueKey,
      branchName: prData.head?.ref || null,
      prStatus,
      mergeStatus,
      diffSummary: prData.title || '',
      changedFiles: [],
      url: prData.html_url,
      createdAt: prData.created_at,
      updatedAt: prData.updated_at,
      mergedAt: prData.merged_at,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.internal(`Failed to fetch pull request details for PR #${prNumber}`);
  }
}

/**
 * Get list of files changed in a PR
 */
async function getPullRequestChangedFiles(token, organizationName, repositoryName, prNumber) {
  if (!prNumber) {
    throw ApiError.badRequest('INVALID_PR_NUMBER', 'PR number is required');
  }

  try {
    const endpoint = `/repos/${organizationName}/${repositoryName}/pulls/${prNumber}/files`;
    const files = await makeGitHubRequest(token, organizationName, repositoryName, endpoint);

    return Array.isArray(files) ? files.map(file => file.filename) : [];
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.warn(`Failed to fetch changed files for PR #${prNumber}:`, error);
    return [];
  }
}

/**
 * Fetch complete PR data with all details
 */
async function getCompletePullRequestData(token, organizationName, repositoryName, prNumber) {
  const prDetails = await getPullRequestDetails(token, organizationName, repositoryName, prNumber);
  const changedFiles = await getPullRequestChangedFiles(token, organizationName, repositoryName, prNumber);

  return {
    ...prDetails,
    changedFiles,
  };
}

/**
 * Search for pull requests by related issue keys
 */
async function getPullRequestsByIssueKeys(token, organizationName, repositoryName, issueKeys) {
  if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
    return [];
  }

  try {
    const endpoint = `/repos/${organizationName}/${repositoryName}/pulls`;
    const allPRs = await makeGitHubRequest(token, organizationName, repositoryName, endpoint);

    if (!Array.isArray(allPRs)) {
      return [];
    }

    const filteredPRs = allPRs.filter(pr => {
      const prContent = `${pr.title || ''} ${pr.body || ''}`;
      return issueKeys.some(key => prContent.includes(key));
    });

    return filteredPRs;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.internal('Failed to fetch pull requests by issue keys');
  }
}

/**
 * Verify GitHub token validity
 */
async function verifyToken(token) {
  try {
    const baseUrl = 'https://api.github.com';
    const url = `${baseUrl}/user`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'User-Agent': 'senior-app',
      },
    });

    return response.status === 200;
  } catch (error) {
    return false;
  }
}

module.exports = {
  makeGitHubRequest,
  getPullRequestsByBranch,
  getPullRequestsByIssueKeys,
  getPullRequestDetails,
  getPullRequestChangedFiles,
  getCompletePullRequestData,
  verifyToken,
};
