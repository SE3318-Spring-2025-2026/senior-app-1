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

async function request(method, path, body) {
  const token = window.localStorage.getItem('authToken');
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

  const data = await response.json();

  if (!response.ok) {
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