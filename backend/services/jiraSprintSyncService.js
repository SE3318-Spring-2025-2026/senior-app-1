const ApiError = require('../errors/apiError');
const {
  buildJiraProjectOpenSprintIssuesRequest,
  buildJiraSprintIssuesRequest,
} = require('./jiraRequestBuilder');
const { resolveTokenReference } = require('./tokenReferenceResolver');
const { storeJiraIssues } = require('./sprintMonitoringPersistenceService');
const MAX_JIRA_ISSUES_PER_SYNC = 1000;

function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function resolveJiraBaseUrl(binding) {
  const workspaceId = asTrimmedString(binding?.jiraWorkspaceId);
  if (!workspaceId) {
    return asTrimmedString(process.env.JIRA_BASE_URL);
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(workspaceId)) {
    return workspaceId;
  }

  if (workspaceId.includes('.')) {
    return `https://${workspaceId}`;
  }

  return `https://${workspaceId}.atlassian.net`;
}

function getFetchImplementation() {
  if (typeof global.fetch !== 'function') {
    throw ApiError.internal('Global fetch API is unavailable. Node.js 18 or newer is required');
  }

  return global.fetch;
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  try {
    return await response.text();
  } catch (error) {
    return null;
  }
}

function buildPaginatedJiraRequest(request, pagination = {}) {
  const { startAt = 0, nextPageToken = null } = pagination;
  const paginatedOptions = {
    ...request.options,
    headers: {
      ...(request.options?.headers || {}),
    },
  };

  if (paginatedOptions.body !== undefined) {
    const body = JSON.parse(paginatedOptions.body);
    const usesCursorPagination = String(request.url).includes('/rest/api/3/search/jql');

    if (usesCursorPagination) {
      if (nextPageToken) {
        body.nextPageToken = nextPageToken;
      } else {
        delete body.nextPageToken;
      }
      delete body.startAt;
    } else {
      body.startAt = startAt;
    }

    paginatedOptions.body = JSON.stringify(body);
    return {
      url: request.url,
      options: paginatedOptions,
      maxResults: Number.isInteger(body.maxResults) && body.maxResults > 0 ? body.maxResults : 100,
      usesCursorPagination,
    };
  }

  const url = new URL(request.url);
  url.searchParams.set('startAt', String(startAt));
  const maxResults = Number.parseInt(url.searchParams.get('maxResults') || '100', 10);

  return {
    url: url.toString(),
    options: paginatedOptions,
    maxResults: Number.isInteger(maxResults) && maxResults > 0 ? maxResults : 100,
    usesCursorPagination: false,
  };
}

async function fetchJiraSprintIssues({
  binding,
  tokenReference,
  sprintId,
  boardId,
  projectKey,
  includeStatuses = [],
}) {
  const jiraEmail = asTrimmedString(binding?.jiraUserEmail) || asTrimmedString(process.env.JIRA_USER_EMAIL);
  if (!jiraEmail) {
    throw ApiError.conflict(
      'JIRA_USER_EMAIL_NOT_CONFIGURED',
      'A Jira user email must be configured to fetch Jira sprint data',
    );
  }

  const apiToken = resolveTokenReference(tokenReference?.jiraTokenRef, { provider: 'JIRA' });
  const request = boardId && sprintId
    ? buildJiraSprintIssuesRequest({
      boardId,
      sprintId,
      includeStatuses,
    }, {
      baseUrl: resolveJiraBaseUrl(binding),
      email: jiraEmail,
      apiToken,
    })
    : buildJiraProjectOpenSprintIssuesRequest({
      projectKey: projectKey || binding?.jiraProjectKey,
      includeStatuses,
    }, {
      baseUrl: resolveJiraBaseUrl(binding),
      email: jiraEmail,
      apiToken,
    });

  const issues = [];
  let startAt = 0;
  let nextPageToken = null;

  while (issues.length < MAX_JIRA_ISSUES_PER_SYNC) {
    const paginatedRequest = buildPaginatedJiraRequest(request, { startAt, nextPageToken });
    const response = await getFetchImplementation()(paginatedRequest.url, paginatedRequest.options);
    if (!response.ok) {
      const errorPayload = await parseErrorResponse(response);
      const message = typeof errorPayload === 'string'
        ? errorPayload
        : errorPayload?.errorMessages?.join(', ')
          || errorPayload?.message
          || 'Failed to fetch Jira sprint issues';
      throw new ApiError(response.status >= 500 ? 502 : response.status, 'JIRA_UPSTREAM_REQUEST_FAILED', message);
    }

    const payload = await response.json();
    const pageIssues = Array.isArray(payload?.issues) ? payload.issues : [];
    issues.push(...pageIssues);

    if (paginatedRequest.usesCursorPagination) {
      const resolvedNextPageToken = typeof payload?.nextPageToken === 'string' && payload.nextPageToken
        ? payload.nextPageToken
        : null;
      const isLast = payload?.isLast === true;
      if (pageIssues.length === 0 || isLast || !resolvedNextPageToken) {
        break;
      }

      nextPageToken = resolvedNextPageToken;
      continue;
    }

    const total = Number.isInteger(payload?.total) && payload.total >= 0
      ? payload.total
      : null;
    if (pageIssues.length === 0) {
      break;
    }

    startAt += pageIssues.length;
    if ((total !== null && startAt >= total) || pageIssues.length < paginatedRequest.maxResults) {
      break;
    }
  }

  return issues.slice(0, MAX_JIRA_ISSUES_PER_SYNC);
}

async function syncJiraSprintIssues({ binding, tokenReference, teamId, sprintId, boardId, includeStatuses = [] }) {
  const issues = await fetchJiraSprintIssues({
    binding,
    tokenReference,
    sprintId,
    boardId,
    includeStatuses,
  });

  const persisted = await storeJiraIssues({
    teamId,
    sprintId,
    issues,
  });

  return {
    ...persisted,
    upstreamIssueCount: issues.length,
  };
}

module.exports = {
  fetchJiraSprintIssues,
  syncJiraSprintIssues,
};
