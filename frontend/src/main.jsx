import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminProfessorRegistrationPage from './AdminProfessorRegistrationPage';
import AuthGatewayPage from './AuthGatewayPage';
import AuthPlaceholderPage from './AuthPlaceholderPage';
import './styles.css';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

function resolvePage(currentPath) {
  switch (currentPath) {
    case '/':
      return <AuthGatewayPage />;
    case '/students/register':
      return <App />;
    case '/students/login':
      return (
        <AuthPlaceholderPage
          eyebrow="Student Access"
          title="Student Login"
          description="Returning students will sign in here before accessing their group, GitHub, and sprint workflows."
        />
      );
    case '/professors/login':
      return (
        <AuthPlaceholderPage
          eyebrow="Professor Access"
          title="Professor Login"
          description="Professors will sign in here after setting their initial password."
        />
      );
    case '/admin/login':
      return (
        <AuthPlaceholderPage
          eyebrow="Admin Access"
          title="Admin Login"
          description="Admins will sign in here before opening admin-only features such as professor registration."
        />
      );
    case '/professors/password-setup':
      return (
        <AuthPlaceholderPage
          eyebrow="Professor Access"
          title="Professor Initial Password Setup"
          description="Newly registered professors will use their one-time setup token here to create their first password."
        />
      );
    case '/admin/professors/register':
      return <AdminProfessorRegistrationPage />;
    default:
      return <AuthGatewayPage />;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {resolvePage(path)}
  </React.StrictMode>,
);
