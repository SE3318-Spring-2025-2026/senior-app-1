import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AdminHomePage from './AdminHomePage';
import GroupFormationPage from './GroupFormationPage';
import AdminLoginPage from './AdminLoginPage';
import AdminProfessorCreatePage from './AdminProfessorCreatePage';
import AuthGatewayPage from './AuthGatewayPage';
import CoordinatorHomePage from './CoordinatorHomePage';
import CoordinatorLoginPage from './CoordinatorLoginPage';
import CoordinatorStudentIdUploadPage from './CoordinatorStudentIdUploadPage';
import GroupPage from './GroupPage';
import ProfessorLoginPage from './ProfessorLoginPage';
import ProfessorPasswordSetupPage from './ProfessorPasswordSetupPage';
import Register from './Register';
import StudentInvitationsPage from './StudentInvitationsPage';
import StudentLoginPage from './StudentLoginPage';
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
              <Route path="/students/login" element={<StudentLoginPage />} />
              <Route path="/students/group" element={<GroupFormationPage />} />
              <Route path="/students/invitations" element={<StudentInvitationsPage />} />
              <Route path="/professors/login" element={<ProfessorLoginPage />} />
              <Route path="/professors/password-setup" element={<ProfessorPasswordSetupPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/admin/professors/new" element={<AdminProfessorCreatePage />} />
              <Route path="/coordinator/login" element={<CoordinatorLoginPage />} />
              <Route path="/coordinator" element={<CoordinatorHomePage />} />
              <Route path="/coordinator/student-id-registry/import" element={<CoordinatorStudentIdUploadPage />} />
              <Route path="/groups/:groupId" element={<GroupPage />} />
              <Route path="*" element={<AuthGatewayPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
