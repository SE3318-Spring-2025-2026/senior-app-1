const STORAGE_KEYS = {
  token: 'authToken',
  user: 'authUser',
  legacyAdminToken: 'adminToken',
  legacyAdminUser: 'adminUser',
};

function parseStoredUser(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

export function getStoredSession() {
  const token = window.localStorage.getItem(STORAGE_KEYS.token)
    || window.localStorage.getItem(STORAGE_KEYS.legacyAdminToken)
    || '';
  const user = parseStoredUser(window.localStorage.getItem(STORAGE_KEYS.user))
    || parseStoredUser(window.localStorage.getItem(STORAGE_KEYS.legacyAdminUser));

  return {
    token: token.trim() || null,
    user,
  };
}

export function persistSession(token, user) {
  if (token) {
    window.localStorage.setItem(STORAGE_KEYS.token, token);
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.token);
  }

  if (user) {
    const serializedUser = JSON.stringify(user);
    window.localStorage.setItem(STORAGE_KEYS.user, serializedUser);

    if (user.role === 'admin') {
      window.localStorage.setItem(STORAGE_KEYS.legacyAdminToken, token || '');
      window.localStorage.setItem(STORAGE_KEYS.legacyAdminUser, serializedUser);
    }
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.user);
    window.localStorage.removeItem(STORAGE_KEYS.legacyAdminUser);
  }

  if (!token) {
    window.localStorage.removeItem(STORAGE_KEYS.legacyAdminToken);
  }
}

export function clearStoredSession() {
  window.localStorage.removeItem(STORAGE_KEYS.token);
  window.localStorage.removeItem(STORAGE_KEYS.user);
  window.localStorage.removeItem(STORAGE_KEYS.legacyAdminToken);
  window.localStorage.removeItem(STORAGE_KEYS.legacyAdminUser);
}
