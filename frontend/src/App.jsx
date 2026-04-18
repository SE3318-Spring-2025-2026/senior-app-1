import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AdminHomePage from './AdminHomePage';
import AdminCoordinatorCreatePage from './AdminCoordinatorCreatePage';
import AdminLoginPage from './AdminLoginPage';
import AdminProfessorCreatePage from './AdminProfessorCreatePage';
import AuthPage from './AuthPage';
import CoordinatorGroupMembershipPage from './CoordinatorGroupMembershipPage';
import CoordinatorAdvisorTransferPage from './CoordinatorAdvisorTransferPage';
import CoordinatorHomePage from './CoordinatorHomePage';
import CoordinatorLoginPage from './CoordinatorLoginPage';
import CoordinatorStudentIdUploadPage from './CoordinatorStudentIdUploadPage';
import GroupPage from './GroupPage';
import HomePage from './HomePage';
import ProfessorAdvisorRequestsPage from './ProfessorAdvisorRequestsPage';
import ProfessorLoginPage from './ProfessorLoginPage';
import ProfessorPasswordSetupPage from './ProfessorPasswordSetupPage';
import Register from './Register';
import StudentLoginPage from './StudentLoginPage';
import StudentGroupShellPage from './StudentGroupShellPage';
import StudentInvitationsPage from './StudentInvitationsPage';
import AppShell from './components/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import './styles.css';

import AdvisorRequestsPage from './AdvisorRequestsPage';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/students/register" element={<AuthPage />} />
              <Route path="/students/login" element={<AuthPage />} />
              <Route path="/students/groups/new" element={<StudentGroupShellPage />} />
              <Route path="/students/notifications" element={<StudentInvitationsPage />} />
              <Route path="/professors/login" element={<AuthPage />} />
              <Route path="/professors/notifications" element={<ProfessorAdvisorRequestsPage />} />
              <Route path="/professors/password-setup" element={<ProfessorPasswordSetupPage />} />
              <Route path="/admin/login" element={<AuthPage />} />
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/admin/professors/new" element={<AdminProfessorCreatePage />} />
              <Route path="/admin/coordinators/new" element={<AdminCoordinatorCreatePage />} />
              <Route path="/coordinator/login" element={<AuthPage />} />
              <Route path="/coordinator" element={<CoordinatorHomePage />} />
              <Route path="/coordinator/student-id-registry/import" element={<CoordinatorStudentIdUploadPage />} />
              <Route path="/coordinator/groups/manage" element={<CoordinatorGroupMembershipPage />} />
              <Route path="/coordinator/groups/transfer" element={<CoordinatorAdvisorTransferPage />} />
              <Route path="/groups/:groupId" element={<GroupPage />} />
              <Route path="/advisor/requests" element={<AdvisorRequestsPage />} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
