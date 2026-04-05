import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminHomePage from './AdminHomePage';
import AdminLoginPage from './AdminLoginPage';
import AdminProfessorCreatePage from './AdminProfessorCreatePage';
import AuthGatewayPage from './AuthGatewayPage';
import AuthPlaceholderPage from './AuthPlaceholderPage';
import ProfessorPasswordSetupPage from './ProfessorPasswordSetupPage';
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
    case '/admin':
      return <AdminHomePage />;
    case '/admin/login':
      return <AdminLoginPage />;
    case '/admin/professors/new':
      return <AdminProfessorCreatePage />;
    case '/professors/password-setup':
      return <ProfessorPasswordSetupPage />;
    default:
      return <AuthGatewayPage />;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {resolvePage(path)}
  </React.StrictMode>,
);
