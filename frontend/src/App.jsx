import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AdminHomePage from './AdminHomePage';
import AdminLoginPage from './AdminLoginPage';
import AdminProfessorCreatePage from './AdminProfessorCreatePage';
import AuthGatewayPage from './AuthGatewayPage';
import AuthPlaceholderPage from './AuthPlaceholderPage';
import CoordinatorStudentIdUploadPage from './CoordinatorStudentIdUploadPage';
import ProfessorPasswordSetupPage from './ProfessorPasswordSetupPage';
import Register from './Register';
import AppShell from './components/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import './styles.css';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<AuthGatewayPage />} />
              <Route path="/students/register" element={<Register />} />
              <Route
                path="/students/login"
                element={(
                  <AuthPlaceholderPage
                    eyebrow="Student Access"
                    title="Student Login"
                    description="Returning students will sign in here before accessing their group, GitHub, and sprint workflows."
                  />
                )}
              />
              <Route
                path="/professors/login"
                element={(
                  <AuthPlaceholderPage
                    eyebrow="Professor Access"
                    title="Professor Login"
                    description="Professors will sign in here after setting their initial password."
                  />
                )}
              />
              <Route path="/professors/password-setup" element={<ProfessorPasswordSetupPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/admin/professors/new" element={<AdminProfessorCreatePage />} />
              <Route path="/coordinator/student-id-registry/import" element={<CoordinatorStudentIdUploadPage />} />
              <Route path="*" element={<AuthGatewayPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
