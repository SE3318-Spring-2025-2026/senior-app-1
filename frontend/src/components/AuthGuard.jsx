import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

function redirectTo(path) {
  if (window.location.pathname !== path) {
    window.location.replace(path);
  }
}

export default function AuthGuard({
  allowedRoles = [],
  children,
  fallbackPath = '/unauthorized',
  requireAuth = true,
  unauthenticatedPath = '/admin/login',
}) {
  const { hasRole, isAuthenticated } = useAuth();
  const isAllowed = !requireAuth || (isAuthenticated && hasRole(allowedRoles));

  useEffect(() => {
    if (isAllowed) {
      return;
    }

    if (!isAuthenticated) {
      redirectTo(unauthenticatedPath);
      return;
    }

    redirectTo(fallbackPath);
  }, [fallbackPath, isAllowed, isAuthenticated, unauthenticatedPath]);

  if (!isAllowed) {
    return null;
  }

  return children;
}
