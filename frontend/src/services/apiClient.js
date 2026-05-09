function mapErrorResponse(payload) {
  switch (payload.code) {
    case 'INVALID_STUDENT_ID':
      return { type: 'error', title: 'Invalid student ID', result: 'Rejected' };
    case 'ALREADY_REGISTERED':
      return { type: 'warning', title: 'Student already registered', result: 'Already exists' };
    case 'DUPLICATE_EMAIL':
      return { type: 'warning', title: 'Email already in use', result: 'Duplicate email' };
    case 'WEAK_PASSWORD':
      return { type: 'error', title: 'Weak password', result: 'Rejected' };
    case 'STUDENT_NOT_ELIGIBLE':
      return { type: 'error', title: 'Student not eligible', result: 'Rejected' };
    case 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT':
      return { type: 'warning', title: 'GitHub already linked', result: 'Already linked' };
    case 'DUPLICATE_MEMBER':
      return { type: 'warning', title: 'Already a member', result: 'Already joined' };
    case 'MAX_MEMBERS_REACHED':
      return { type: 'warning', title: 'Group is full', result: 'At capacity' };
    case 'GROUP_FINALIZED':
      return { type: 'error', title: 'Group is closed', result: 'No longer accepting' };
    case 'GROUP_NOT_FOUND':
      return { type: 'error', title: 'Group not found', result: 'Not found' };
    default:
      return { type: 'error', title: 'Validation failed', result: 'Failed' };
  }
}

function readActiveToken() {
  // Login flows store the JWT under role-specific keys. Pick whichever exists.
  const storage = window.localStorage;
  return (
    storage.getItem('authToken') ||
    storage.getItem('studentToken') ||
    storage.getItem('professorToken') ||
    storage.getItem('coordinatorToken') ||
    storage.getItem('adminToken') ||
    ''
  );
}

const STALE_TOKEN_CODES = new Set(['INVALID_TOKEN', 'AUTH_TOKEN_MISSING', 'SESSION_EXPIRED']);

function clearStoredAuth() {
  for (const key of [
    'authToken', 'studentToken', 'professorToken', 'coordinatorToken', 'adminToken',
    'studentUser', 'professorUser', 'coordinatorUser', 'adminUser',
  ]) {
    try { window.localStorage.removeItem(key); } catch (_) {}
  }
}

async function request(method, path, body) {
  const token = readActiveToken();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch (_) { data = { _raw: text }; }

  if (!response.ok) {
    // If the stored JWT is invalid or expired (typically because the backend
    // was re-seeded and the user row is gone), drop it so the next page load
    // bounces to /login instead of looping with the stale token.
    if (response.status === 401 && data?.code && STALE_TOKEN_CODES.has(data.code)) {
      clearStoredAuth();
    }
    const error = new Error(data?.message || 'Request failed');
    error.response = { data, status: response.status };
    error.mappedError = mapErrorResponse(data || {});
    throw error;
  }

  return {
    data,
    status: response.status,
  };
}

const apiClient = {
  get(path) {
    return request('GET', path);
  },
  post(path, body) {
    return request('POST', path, body);
  },
  put(path, body) {
    return request('PUT', path, body);
  },
  patch(path, body) {
    return request('PATCH', path, body);
  },
  delete(path) {
    return request('DELETE', path);
  },
};

export default apiClient;