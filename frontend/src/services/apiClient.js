import axios from 'axios';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.data) {
      // Map backend error codes to user-friendly messages
      const mappedError = mapErrorResponse(error.response.data);
      error.mappedError = mappedError;
    }
    return Promise.reject(error);
  }
);

// Error mapping function (copied from App.jsx for centralization)
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

export default apiClient;