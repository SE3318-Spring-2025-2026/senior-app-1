import { createContext, useContext, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, persistSession } from '../services/session';

const AuthContext = createContext(null);

function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  return {
    ...user,
    role: user.role || null,
  };
}

export function AuthProvider({ children }) {
  const storedSession = getStoredSession();
  const [token, setToken] = useState(storedSession.token);
  const [user, setUser] = useState(normalizeUser(storedSession.user));

  function login(nextToken, nextUser) {
    const normalizedUser = normalizeUser(nextUser);
    setToken(nextToken);
    setUser(normalizedUser);
    persistSession(nextToken, normalizedUser);
  }

  function logout() {
    setToken(null);
    setUser(null);
    clearStoredSession();
  }

  function hasRole(requiredRoles = []) {
    if (requiredRoles.length === 0) {
      return true;
    }

    return Boolean(user?.role && requiredRoles.includes(user.role));
  }

  const value = useMemo(() => ({
    hasRole,
    isAuthenticated: Boolean(token),
    login,
    logout,
    token,
    user,
  }), [token, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
