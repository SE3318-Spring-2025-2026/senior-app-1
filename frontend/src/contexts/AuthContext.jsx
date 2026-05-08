import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function loadStoredUser() {
  for (const key of ['adminUser', 'coordinatorUser', 'professorUser', 'studentUser']) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.role) return parsed;
    } catch {
      // ignore malformed entries
    }
  }
  return null;
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('authToken'));
  const [user, setUser] = useState(() => loadStoredUser());

  const login = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('authToken', newToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
  };

  const isAuthenticated = !!token;

  const hasRole = (requiredRoles) => {
    if (!user || !user.role) return false;
    return requiredRoles.includes(user.role);
  };

  const value = {
    token,
    user,
    isAuthenticated,
    hasRole,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};