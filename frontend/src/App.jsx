import SprintEvaluationHistoryPage from './SprintEvaluationHistoryPage';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminHomePage from './AdminHomePage';
import AdminCoordinatorCreatePage from './AdminCoordinatorCreatePage';
import AdminAuditLogPage from './AdminAuditLogPage';
import AdminProfessorCreatePage from './AdminProfessorCreatePage';
import AdminPasswordResetLinkPage from './AdminPasswordResetLinkPage';
import AuthPage from './AuthPage';
import CoordinatorGroupMembershipPage from './CoordinatorGroupMembershipPage';
import CoordinatorAdvisorTransferPage from './CoordinatorAdvisorTransferPage';
import GroupCleanupPage from './GroupCleanupPage';
import CoordinatorHomePage from './CoordinatorHomePage';
import CoordinatorStudentIdUploadPage from './CoordinatorStudentIdUploadPage';
import CoordinatorRubricPage from './CoordinatorRubricPage';
import GroupPage from './GroupPage';
import HomePage from './HomePage';
import IntegrationConfigurationPage from './IntegrationConfigurationPage';
import LoginPage from './LoginPage';
import ProfessorHomePage from './ProfessorHomePage';
import ProfessorAdvisorRequestsPage from './ProfessorAdvisorRequestsPage';
import ProfessorPasswordSetupPage from './ProfessorPasswordSetupPage';
import Register from './Register';
import ResetPasswordPage from './ResetPasswordPage';
import StudentGroupShellPage from './StudentGroupShellPage';
import StudentInvitationsPage from './StudentInvitationsPage';
import SubmitAdvisorRequestPage from './SubmitAdvisorRequestPage';
import TeamLeaderAdvisorRequestDetailsPage from './TeamLeaderAdvisorRequestDetailsPage';
import AppShell from './components/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import './styles.css';
import SprintEvaluationPage from './SprintEvaluationPage';

import AdvisorRequestsPage from './AdvisorRequestsPage';
import ProfessorCommitteeSubmissionsPage from './ProfessorCommitteeSubmissionsPage';
import CommitteeGradingPage from './CommitteeGradingPage';
import SubmissionEditorPage from './SubmissionEditorPage';
import CoordinatorWeightConfigurationPage from './CoordinatorWeightConfigurationPage';
import AuthGuard from './components/AuthGuard';
import FinalEvaluationWeightPage from './FinalEvaluationWeightPage';
import FinalEvaluationGroupsPage from './FinalEvaluationGroupsPage';
import FinalEvaluationDashboardPage from './FinalEvaluationDashboardPage';
import AdvisorFinalGradePage from './AdvisorFinalGradePage';
import CommitteeFinalGradePage from './CommitteeFinalGradePage';
import StudentFinalGradePage from './StudentFinalGradePage';
import ProfessorFinalEvaluationEntryPage from './ProfessorFinalEvaluationEntryPage';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth" element={<LoginPage />} />
              <Route path="/students/register" element={<AuthPage />} />
              <Route path="/students/login" element={<Navigate to="/login" replace />} />
              <Route path="/students/groups/manage" element={<StudentGroupShellPage />} />
              <Route path="/students/groups/new" element={<StudentGroupShellPage />} />
              <Route path="/students/final-grade" element={<AuthGuard allowedRoles={['STUDENT']}><StudentFinalGradePage /></AuthGuard>} />
              <Route path="/students/groups/:teamId/integrations" element={<AuthGuard allowedRoles={['STUDENT']}><IntegrationConfigurationPage /></AuthGuard>} />
              <Route path="/students/groups/:teamId/sprints/evaluation" element={<AuthGuard allowedRoles={['STUDENT']}><SprintEvaluationPage /></AuthGuard>} />
              <Route path="/students/groups/:teamId/sprints/:sprintId/evaluation-history" element={<AuthGuard allowedRoles={['STUDENT']}><SprintEvaluationHistoryPage /></AuthGuard>} />
              <Route path="/students/notifications" element={<StudentInvitationsPage />} />
              <Route path="/team-leader/submission" element={<AuthGuard allowedRoles={['STUDENT']}><SubmissionEditorPage /></AuthGuard>} />
              <Route path="/team-leader/advisor-requests/new" element={<SubmitAdvisorRequestPage />} />
              <Route path="/team-leader/advisor-requests/:requestId" element={<TeamLeaderAdvisorRequestDetailsPage />} />
              <Route path="/professors/login" element={<Navigate to="/login" replace />} />
              <Route path="/professors" element={<ProfessorHomePage />} />
              <Route path="/professor" element={<ProfessorHomePage />} />
              <Route path="/professors/notifications" element={<ProfessorAdvisorRequestsPage />} />
              <Route path="/professors/password-setup" element={<ProfessorPasswordSetupPage />} />
              <Route path="/admin/login" element={<Navigate to="/login" replace />} />
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogPage />} />
              <Route path="/admin/professors/new" element={<AdminProfessorCreatePage />} />
              <Route path="/admin/coordinators/new" element={<AdminCoordinatorCreatePage />} />
              <Route path="/admin/password-reset-links" element={<AuthGuard allowedRoles={['ADMIN']}><AdminPasswordResetLinkPage /></AuthGuard>} />
              <Route path="/admin/groups/cleanup" element={<GroupCleanupPage role="ADMIN" />} />
              <Route path="/coordinator/login" element={<Navigate to="/login" replace />} />
              <Route path="/coordinator" element={<CoordinatorHomePage />} />
              <Route path="/coordinator/student-id-registry/import" element={<CoordinatorStudentIdUploadPage />} />
              <Route path="/coordinator/groups/manage" element={<CoordinatorGroupMembershipPage />} />
              <Route path="/coordinator/groups/transfer" element={<CoordinatorAdvisorTransferPage />} />
              <Route path="/coordinator/groups/cleanup" element={<GroupCleanupPage role="COORDINATOR" />} />
              <Route path="/coordinator/rubrics" element={<CoordinatorRubricPage />} />
              <Route path="/coordinator/grading/weight-configuration" element={<AuthGuard allowedRoles={['COORDINATOR']}><CoordinatorWeightConfigurationPage /></AuthGuard>} />
              <Route path="/coordinator/final-evaluation/weights" element={<AuthGuard allowedRoles={['COORDINATOR']}><FinalEvaluationWeightPage /></AuthGuard>} />
              <Route path="/coordinator/final-evaluation/groups" element={<AuthGuard allowedRoles={['COORDINATOR']}><FinalEvaluationGroupsPage /></AuthGuard>} />
              <Route path="/coordinator/final-evaluation/groups/:groupId" element={<AuthGuard allowedRoles={['COORDINATOR']}><FinalEvaluationDashboardPage /></AuthGuard>} />
              <Route path="/groups/:groupId" element={<GroupPage />} />
              <Route path="/advisor/requests" element={<AdvisorRequestsPage />} />
              <Route path="/professors/committee-submissions" element={<AuthGuard allowedRoles={['PROFESSOR']}><ProfessorCommitteeSubmissionsPage /></AuthGuard>} />
              <Route path="/professors/committee-review/:submissionId" element={<AuthGuard allowedRoles={['PROFESSOR']}><CommitteeGradingPage /></AuthGuard>} />
              <Route path="/professors/final-evaluation/enter" element={<AuthGuard allowedRoles={['PROFESSOR']}><ProfessorFinalEvaluationEntryPage /></AuthGuard>} />
              <Route path="/professors/final-evaluation/:groupId/advisor-grade" element={<AuthGuard allowedRoles={['PROFESSOR']}><AdvisorFinalGradePage /></AuthGuard>} />
              <Route path="/professors/final-evaluation/:groupId/committee-grade" element={<AuthGuard allowedRoles={['PROFESSOR']}><CommitteeFinalGradePage /></AuthGuard>} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
