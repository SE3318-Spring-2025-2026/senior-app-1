const ApiError = require('../errors/apiError');
const {
  buildJiraProjectOpenSprintIssuesRequest,
  buildJiraSprintIssuesRequest,
} = require('./jiraRequestBuilder');
const { resolveTokenReference } = require('./tokenReferenceResolver');
const { storeJiraIssues } = require('./sprintMonitoringPersistenceService');

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
  return global.fetch || require('node-fetch');
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

async function fetchJiraSprintIssues({
  binding,
  tokenReference,
  sprintId,
  boardId,
  projectKey,
  includeStatuses = [],
}) {
  const jiraEmail = asTrimmedString(process.env.JIRA_USER_EMAIL);
  if (!jiraEmail) {
    throw ApiError.conflict(
      'JIRA_USER_EMAIL_NOT_CONFIGURED',
      'JIRA_USER_EMAIL must be configured to fetch Jira sprint data',
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

  const response = await getFetchImplementation()(request.url, request.options);
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
  return Array.isArray(payload?.issues) ? payload.issues : [];
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
