import { clearStoredSession, getStoredSession } from './session';

function buildHeaders(headers, body, authToken) {
  const nextHeaders = new Headers(headers || {});

  if (body && !nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json');
  }

  if (authToken && !nextHeaders.has('Authorization')) {
    nextHeaders.set('Authorization', `Bearer ${authToken}`);
  }

  return nextHeaders;
}

async function parseResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

export async function apiRequest(path, options = {}) {
  const {
    auth = true,
    body,
    headers,
    method = 'GET',
    onUnauthorized = 'keep',
    token,
    ...rest
  } = options;
  const session = getStoredSession();
  const authToken = auth ? (token || session.token) : null;
  const response = await fetch(`/api${path}`, {
    ...rest,
    method,
    headers: buildHeaders(headers, body, authToken),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && onUnauthorized === 'clear-session') {
      clearStoredSession();
    }

    const error = new Error((data && data.message) || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return {
    data,
    status: response.status,
  };
}

const apiClient = {
  delete(path, options) {
    return apiRequest(path, { ...options, method: 'DELETE' });
  },
  get(path, options) {
    return apiRequest(path, { ...options, method: 'GET' });
  },
  post(path, body, options) {
    return apiRequest(path, { ...options, method: 'POST', body });
  },
  put(path, body, options) {
    return apiRequest(path, { ...options, method: 'PUT', body });
  },
};

export default apiClient;
