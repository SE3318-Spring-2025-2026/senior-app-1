function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
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

function buildJiraRequest(request = {}, config = {}) {
  const path = asTrimmedString(request.path);
  if (!path) {
    throw new Error('Jira request path is required.');
  }

  const normalizedPath = path.replace(/^\//, '');
  const url = new URL(normalizedPath, normalizeJiraBaseUrl(config.baseUrl));
  appendQueryParams(url, request.query || {});

  const headers = {
    Accept: 'application/json',
    ...(request.headers || {}),
  };

  const authHeader = buildJiraAuthHeader(config);
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

  return buildJiraRequest({
    path: `/rest/agile/1.0/board/${encodeURIComponent(normalizedBoardId)}/sprint/${encodeURIComponent(normalizedSprintId)}/issue`,
    query: {
      fields: [
        'summary',
        'description',
        'status',
        'assignee',
        'storyPoints',
        'customfield_10016',
        'customfield_10020',
        'sprint',
      ].join(','),
      maxResults: 100,
      status: normalizedStatuses,
    },
  }, config);
}

module.exports = {
  buildJiraAuthHeader,
  buildJiraRequest,
  buildJiraSprintIssuesRequest,
  hasRealJiraApiConfig,
  normalizeJiraBaseUrl,
};
