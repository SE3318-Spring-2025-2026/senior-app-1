import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AuthGuard = ({ allowedRoles = [], children }) => {
  const { isAuthenticated, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      // Redirect to login page (assuming '/login')
      navigate('/login');
      return;
    }

    if (allowedRoles.length > 0 && !hasRole(allowedRoles)) {
      // Redirect to unauthorized page
      navigate('/unauthorized');
      return;
    }
  }, [isAuthenticated, allowedRoles, hasRole, navigate]);

  // If authenticated and has role, render children
  if (!isAuthenticated || (allowedRoles.length > 0 && !hasRole(allowedRoles))) {
    return <div>Loading...</div>; // Or a spinner
  }

  return children;
};

export default AuthGuard;