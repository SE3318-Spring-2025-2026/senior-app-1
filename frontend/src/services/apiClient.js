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
};

export default apiClient;
