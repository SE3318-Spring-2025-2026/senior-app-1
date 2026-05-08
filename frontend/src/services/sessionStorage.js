export const AUTH_STORAGE_KEYS = [
  'authToken',
  'adminToken',
  'adminUser',
  'coordinatorToken',
  'coordinatorUser',
  'professorToken',
  'professorUser',
  'studentToken',
  'studentUser',
];

export function clearAuthStorage() {
  AUTH_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function persistRoleSession({ tokenKey, userKey }, result) {
  const token = result.token || '';
  clearAuthStorage();
  window.localStorage.setItem(tokenKey, token);
  window.localStorage.setItem('authToken', token);
  window.localStorage.setItem(userKey, JSON.stringify(result.user || {}));
}
