import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AdminHomePage from './AdminHomePage';
import AdminCoordinatorCreatePage from './AdminCoordinatorCreatePage';
import AdminAuditLogPage from './AdminAuditLogPage';
import AdminLoginPage from './AdminLoginPage';
import AdminProfessorCreatePage from './AdminProfessorCreatePage';
import AuthPage from './AuthPage';
import CoordinatorGroupMembershipPage from './CoordinatorGroupMembershipPage';
import CoordinatorAdvisorTransferPage from './CoordinatorAdvisorTransferPage';
import GroupCleanupPage from './GroupCleanupPage';
import CoordinatorHomePage from './CoordinatorHomePage';
import CoordinatorLoginPage from './CoordinatorLoginPage';
import CoordinatorStudentIdUploadPage from './CoordinatorStudentIdUploadPage';
import GroupPage from './GroupPage';
import HomePage from './HomePage';
import ProfessorHomePage from './ProfessorHomePage';
import ProfessorAdvisorRequestsPage from './ProfessorAdvisorRequestsPage';
import ProfessorLoginPage from './ProfessorLoginPage';
import ProfessorPasswordSetupPage from './ProfessorPasswordSetupPage';
import Register from './Register';
import StudentLoginPage from './StudentLoginPage';
import StudentGroupShellPage from './StudentGroupShellPage';
import StudentInvitationsPage from './StudentInvitationsPage';
import SubmitAdvisorRequestPage from './SubmitAdvisorRequestPage';
import TeamLeaderAdvisorRequestDetailsPage from './TeamLeaderAdvisorRequestDetailsPage';
import AppShell from './components/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import './styles.css';

import AdvisorRequestsPage from './AdvisorRequestsPage';
import ProfessorCommitteeSubmissionsPage from './ProfessorCommitteeSubmissionsPage';
import CommitteeGradingPage from './CommitteeGradingPage';
import SubmissionEditorPage from './SubmissionEditorPage';
import CoordinatorWeightConfigurationPage from './CoordinatorWeightConfigurationPage';
import AuthGuard from './components/AuthGuard';

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
              <Route path="/students/groups/manage" element={<StudentGroupShellPage />} />
              <Route path="/students/groups/new" element={<StudentGroupShellPage />} />
              <Route path="/students/notifications" element={<StudentInvitationsPage />} />
              <Route path="/team-leader/submission" element={<AuthGuard allowedRoles={['STUDENT']}><SubmissionEditorPage /></AuthGuard>} />
              <Route path="/team-leader/advisor-requests/new" element={<SubmitAdvisorRequestPage />} />
              <Route path="/team-leader/advisor-requests/:requestId" element={<TeamLeaderAdvisorRequestDetailsPage />} />
              <Route path="/professors/login" element={<AuthPage />} />
              <Route path="/professors" element={<ProfessorHomePage />} />
              <Route path="/professor" element={<ProfessorHomePage />} />
              <Route path="/professors/notifications" element={<ProfessorAdvisorRequestsPage />} />
              <Route path="/professors/password-setup" element={<ProfessorPasswordSetupPage />} />
              <Route path="/admin/login" element={<AuthPage />} />
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogPage />} />
              <Route path="/admin/professors/new" element={<AdminProfessorCreatePage />} />
              <Route path="/admin/coordinators/new" element={<AdminCoordinatorCreatePage />} />
              <Route path="/admin/groups/cleanup" element={<GroupCleanupPage role="ADMIN" />} />
              <Route path="/coordinator/login" element={<AuthPage />} />
              <Route path="/coordinator" element={<CoordinatorHomePage />} />
              <Route path="/coordinator/student-id-registry/import" element={<CoordinatorStudentIdUploadPage />} />
              <Route path="/coordinator/groups/manage" element={<CoordinatorGroupMembershipPage />} />
              <Route path="/coordinator/groups/transfer" element={<CoordinatorAdvisorTransferPage />} />
              <Route path="/coordinator/groups/cleanup" element={<GroupCleanupPage role="COORDINATOR" />} />
              <Route path="/coordinator/grading/weight-configuration" element={<AuthGuard allowedRoles={['COORDINATOR']}><CoordinatorWeightConfigurationPage /></AuthGuard>} />
              <Route path="/groups/:groupId" element={<GroupPage />} />
              <Route path="/advisor/requests" element={<AdvisorRequestsPage />} />
              <Route path="/professors/committee-submissions" element={<ProfessorCommitteeSubmissionsPage />} />
              <Route path="/professors/committee-review/:submissionId" element={<CommitteeGradingPage />} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
