function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function validateProjectKey(projectKey) {
  if (!/^[A-Z][A-Z0-9_-]*$/.test(projectKey)) {
    throw new Error('projectKey must contain only uppercase letters, numbers, underscores, or hyphens.');
  }
}

function escapeJqlString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function normalizeJiraBaseUrl(baseUrl = process.env.JIRA_BASE_URL) {
  const normalized = asTrimmedString(baseUrl);
  if (!normalized) {
    return 'https://mocked-jira.local/';
  }

  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function hasRealJiraApiConfig(config = {}) {
  const baseUrl = asTrimmedString(config.baseUrl ?? process.env.JIRA_BASE_URL);
  const email = asTrimmedString(config.email ?? process.env.JIRA_USER_EMAIL);
  const apiToken = asTrimmedString(config.apiToken ?? process.env.JIRA_API_TOKEN);

  return Boolean(baseUrl && email && apiToken);
}

function buildJiraAuthHeader(config = {}) {
  const email = asTrimmedString(config.email ?? process.env.JIRA_USER_EMAIL);
  const apiToken = asTrimmedString(config.apiToken ?? process.env.JIRA_API_TOKEN);

  if (!email || !apiToken) {
    return null;
  }

  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
}

function appendQueryParams(url, query = {}) {
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') {
          url.searchParams.append(key, String(entry));
        }
      });
      return;
    }

    url.searchParams.set(key, String(value));
  });
}

function isAbsoluteUrl(value) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

function buildJiraRequest(request = {}, config = {}) {
  const path = asTrimmedString(request.path);
  if (!path) {
    throw new Error('Jira request path is required.');
  }

  if (isAbsoluteUrl(path)) {
    throw new Error('Jira request path must be relative.');
  }

  const normalizedPath = path.replace(/^\//, '');
  const normalizedBaseUrl = normalizeJiraBaseUrl(config.baseUrl);
  const url = new URL(normalizedPath, normalizedBaseUrl);
  if (url.origin !== new URL(normalizedBaseUrl).origin) {
    throw new Error('Jira request URL must stay within the configured Jira origin.');
  }
  appendQueryParams(url, request.query || {});

  const headers = {
    Accept: 'application/json',
    ...(request.headers || {}),
  };

  const authHeader = hasRealJiraApiConfig(config)
    ? buildJiraAuthHeader(config)
    : null;
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const options = {
    method: asTrimmedString(request.method).toUpperCase() || 'GET',
    headers,
  };

  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body);
  }

  return {
    url: url.toString(),
    options,
    mock: !hasRealJiraApiConfig(config),
  };
}

function buildJiraSprintIssuesRequest({ boardId, sprintId, includeStatuses = [] } = {}, config = {}) {
  const normalizedBoardId = asTrimmedString(boardId);
  const normalizedSprintId = asTrimmedString(sprintId);

  if (!normalizedBoardId) {
    throw new Error('boardId is required.');
  }

  if (!normalizedSprintId) {
    throw new Error('sprintId is required.');
  }

  const normalizedStatuses = Array.isArray(includeStatuses)
    ? includeStatuses.map((status) => asTrimmedString(status)).filter(Boolean)
    : [];
  const fields = Array.isArray(config.fields) && config.fields.length > 0
    ? config.fields.map((field) => asTrimmedString(field)).filter(Boolean)
    : [
      'summary',
      'description',
      'status',
      'assignee',
      'storyPoints',
      'customfield_10016',
      'customfield_10020',
      'sprint',
    ];
  const maxResults = Number.isInteger(config.maxResults) && config.maxResults > 0
    ? config.maxResults
    : 100;

  return buildJiraRequest({
    path: `/rest/agile/1.0/board/${encodeURIComponent(normalizedBoardId)}/sprint/${encodeURIComponent(normalizedSprintId)}/issue`,
    query: {
      fields: fields.join(','),
      maxResults,
      status: normalizedStatuses,
    },
  }, config);
}

function buildJiraProjectOpenSprintIssuesRequest({ projectKey, includeStatuses = [] } = {}, config = {}) {
  const normalizedProjectKey = asTrimmedString(projectKey);
  if (!normalizedProjectKey) {
    throw new Error('projectKey is required.');
  }

  validateProjectKey(normalizedProjectKey);

  const normalizedStatuses = Array.isArray(includeStatuses)
    ? includeStatuses.map((status) => asTrimmedString(status)).filter(Boolean)
    : [];
  const fields = Array.isArray(config.fields) && config.fields.length > 0
    ? config.fields.map((field) => asTrimmedString(field)).filter(Boolean)
    : [
      'summary',
      'description',
      'status',
      'assignee',
      'reporter',
      'storyPoints',
      'customfield_10016',
      'customfield_10020',
      'sprint',
      'created',
      'updated',
    ];
  const maxResults = Number.isInteger(config.maxResults) && config.maxResults > 0
    ? config.maxResults
    : 100;
  const statusClause = normalizedStatuses.length > 0
    ? ` AND status IN (${normalizedStatuses
      .map((status) => `"${escapeJqlString(status)}"`)
      .join(', ')})`
    : '';

  return buildJiraRequest({
    path: '/rest/api/3/search',
    method: 'POST',
    body: {
      jql: `project = "${escapeJqlString(normalizedProjectKey)}" AND sprint in openSprints()${statusClause}`,
      fields,
      maxResults,
    },
  }, config);
}

module.exports = {
  buildJiraAuthHeader,
  buildJiraRequest,
  buildJiraProjectOpenSprintIssuesRequest,
  buildJiraSprintIssuesRequest,
  hasRealJiraApiConfig,
  normalizeJiraBaseUrl,
};
