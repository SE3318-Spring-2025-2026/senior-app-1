import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const roleTitles = {
  STUDENT: 'Student',
  PROFESSOR: 'Professor',
  COORDINATOR: 'Coordinator',
  ADMIN: 'Admin',
};

const roleHomeRoutes = {
  STUDENT: '/home',
  PROFESSOR: '/professors',
  COORDINATOR: '/coordinator',
  ADMIN: '/admin',
};

function detectSessionRole() {
  const checks = [
    ['adminUser', 'ADMIN'],
    ['coordinatorUser', 'COORDINATOR'],
    ['professorUser', 'PROFESSOR'],
    ['studentUser', 'STUDENT'],
  ];

  for (const [userKey, fallbackRole] of checks) {
    const raw = window.localStorage.getItem(userKey);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      return (parsed.role || fallbackRole || '').toUpperCase();
    } catch {
      return fallbackRole;
    }
  }

  return null;
}

function readStudentName() {
  const raw = window.localStorage.getItem('studentUser');
  if (!raw) {
    return 'Student';
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed.fullName || parsed.name || parsed.studentId || parsed.email || 'Student';
  } catch {
    return 'Student';
  }
}

function readStudentSession() {
  const raw = window.localStorage.getItem('studentUser');
  if (!raw) {
    return {
      fullName: 'Student',
      studentId: '',
      githubLinked: false,
      githubUsername: '',
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      fullName: parsed.fullName || parsed.name || parsed.studentId || parsed.email || 'Student',
      studentId: parsed.studentId || '',
      githubLinked: Boolean(parsed.githubLinked),
      githubUsername: parsed.githubUsername || '',
    };
  } catch {
    return {
      fullName: 'Student',
      studentId: '',
      githubLinked: false,
      githubUsername: '',
    };
  }
}

function mapGitHubCallbackFeedback(params) {
  const status = params.get('githubLink');
  if (!status) {
    return null;
  }

  const code = params.get('code') || '';
  const githubUsername = params.get('githubUsername') || '';
  const usedMockOAuth = params.get('mockOAuth') === '1';

  if (status === 'success') {
    return {
      type: usedMockOAuth ? 'info' : 'success',
      title: usedMockOAuth ? 'GitHub mock flow completed' : 'GitHub linked successfully',
      message: usedMockOAuth
        ? 'GitHub OAuth credentials are not configured in the backend, so the local mock callback flow was used.'
        : `${githubUsername || 'Your GitHub account'} is now linked to this student account.`,
      githubUsername,
      githubLinked: true,
    };
  }

  if (
    code === 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT' ||
    code === 'GITHUB_RELINK_NOT_ALLOWED'
  ) {
    return {
      type: 'warning',
      title: 'GitHub already linked',
      message: params.get('message') || 'A GitHub account is already linked for this student.',
      githubUsername,
      githubLinked: Boolean(githubUsername),
    };
  }

  return {
    type: 'error',
    title: 'GitHub link failed',
    message: params.get('message') || 'GitHub OAuth callback failed.',
    githubUsername,
    githubLinked: false,
  };
}

function writeStudentSessionGitHubState({ githubLinked, githubUsername }) {
  const raw = window.localStorage.getItem('studentUser');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const updated = {
      ...parsed,
      githubLinked,
      githubUsername: githubUsername || parsed.githubUsername || '',
    };
    window.localStorage.setItem('studentUser', JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}

function writeStudentSessionUser(user) {
  const updated = {
    ...(user || {}),
  };
  window.localStorage.setItem('studentUser', JSON.stringify(updated));
  return updated;
}

function readGitHubConnection() {
  const session = readStudentSession();
  return {
    linked: Boolean(session.githubLinked),
    username: session.githubUsername || '',
  };
}

export default function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const role = detectSessionRole();
  const title = role ? roleTitles[role] || 'User' : null;
  const [studentSession, setStudentSession] = useState(() => readStudentSession());
  const [studentGroups, setStudentGroups] = useState([]);
  const [githubLinkPending, setGitHubLinkPending] = useState(false);
  const [githubConnection, setGitHubConnection] = useState(() => readGitHubConnection());

  const studentName = role === 'STUDENT' ? studentSession.fullName || readStudentName() : null;

  useEffect(() => {
    if (!title) {
      navigate('/login', { replace: true });
      return;
    }

    if (role && role !== 'STUDENT') {
      const target = roleHomeRoutes[role];
      if (target && location.pathname !== target) {
        navigate(target, { replace: true });
      }
    }
  }, [location.pathname, navigate, role, title]);

  useEffect(() => {
    if (role === 'STUDENT') {
      setStudentSession(readStudentSession());
      setGitHubConnection(readGitHubConnection());
    }
  }, [role]);

  useEffect(() => {
    if (role !== 'STUDENT') {
      return;
    }

    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    apiClient.get('/v1/students/me')
      .then(({ data: payload }) => {
        if (!payload?.user) {
          return;
        }
        const updatedUser = writeStudentSessionUser(payload.user);
        setStudentSession({
          fullName: updatedUser.fullName || updatedUser.name || updatedUser.studentId || updatedUser.email || 'Student',
          studentId: updatedUser.studentId || '',
          githubLinked: Boolean(updatedUser.githubLinked),
          githubUsername: updatedUser.githubUsername || '',
        });
        setGitHubConnection({
          linked: Boolean(updatedUser.githubLinked),
          username: updatedUser.githubUsername || '',
        });
      })
      .catch(() => {});
  }, [role]);

  useEffect(() => {
    if (role !== 'STUDENT') {
      return;
    }

    const callbackSearch = location.search;
    const callbackHandledKey = callbackSearch ? `github-callback-handled:${callbackSearch}` : '';
    const params = new URLSearchParams(location.search);
    const feedback = mapGitHubCallbackFeedback(params);
    if (!feedback) {
      return;
    }

    const alreadyHandled = callbackHandledKey
      ? window.sessionStorage.getItem(callbackHandledKey) === '1'
      : false;

    if (alreadyHandled) {
      params.delete('githubLink');
      params.delete('githubUsername');
      params.delete('studentId');
      params.delete('code');
      params.delete('message');
      params.delete('mockOAuth');

      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
      navigate(nextUrl, { replace: true });
      return;
    }

    if (callbackHandledKey) {
      window.sessionStorage.setItem(callbackHandledKey, '1');
    }

    notify({
      type: feedback.type,
      title: feedback.title,
      message: feedback.message,
    });

    if (feedback.githubLinked) {
      const updatedSession = writeStudentSessionGitHubState({
        githubLinked: true,
        githubUsername: feedback.githubUsername,
      });

      if (updatedSession) {
        setStudentSession({
          fullName: updatedSession.fullName || updatedSession.name || updatedSession.studentId || updatedSession.email || 'Student',
          studentId: updatedSession.studentId || '',
          githubLinked: true,
          githubUsername: updatedSession.githubUsername || feedback.githubUsername || '',
        });
        setGitHubConnection({
          linked: true,
          username: updatedSession.githubUsername || feedback.githubUsername || '',
        });
      } else {
        setStudentSession((current) => ({
          ...current,
          githubLinked: true,
          githubUsername: feedback.githubUsername || current.githubUsername || '',
        }));
        setGitHubConnection((current) => ({
          linked: true,
          username: feedback.githubUsername || current.username || '',
        }));
      }
    }

    params.delete('githubLink');
    params.delete('githubUsername');
    params.delete('studentId');
    params.delete('code');
    params.delete('message');
    params.delete('mockOAuth');

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
    navigate(nextUrl, { replace: true });
  }, [location.search, navigate, notify, role]);

  useEffect(() => {
    if (role !== 'STUDENT') {
      return;
    }

    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    apiClient.get('/v1/groups')
      .then(({ data: payload }) => {
        setStudentGroups(Array.isArray(payload?.data) ? payload.data : []);
      })
      .catch(() => {
        setStudentGroups([]);
      });
  }, [role]);

  async function handleGitHubLink() {
    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
    if (!token) {
      const feedback = {
        type: 'warning',
        title: 'Student session required',
        message: 'Sign in as a student before starting GitHub linking.',
      };
      notify(feedback);
      return;
    }

    setGitHubLinkPending(true);

    try {
      const { data: payload } = await apiClient.get('/v1/students/me/github/link');
      window.location.assign(payload.authorizationUrl);
    } catch (err) {
      const feedback = err.response
        ? {
            type: 'error',
            title: 'GitHub link could not start',
            message: err.response.data?.message || 'Failed to create the GitHub authorization URL.',
          }
        : {
            type: 'error',
            title: 'GitHub link could not start',
            message: 'The backend could not be reached while starting GitHub OAuth.',
          };
      notify(feedback);
    } finally {
      setGitHubLinkPending(false);
    }
  }

  const leaderGroups = studentGroups.filter((group) => group.membershipRole === 'LEADER');
  const memberGroups = studentGroups.filter((group) => group.membershipRole === 'MEMBER');

  if (!title) {
    return null;
  }

  return (
    <main className="page main-empty-page">
      <section className="main-empty-shell" aria-label="Workspace">
        <p className="eyebrow">Senior Project System</p>
        <h1>{title} Home</h1>
        {role === 'STUDENT' ? (
          <section className="student-home-panel">
            <p><strong>Name:</strong> {studentName}</p>
            <p><strong>Student ID:</strong> {studentSession.studentId || 'Unavailable'}</p>
            <p><strong>Leader Groups:</strong> {leaderGroups.length}</p>
            <p><strong>Member Groups:</strong> {memberGroups.length}</p>
            <p className="student-home-note">
              {studentGroups.length === 0
                ? 'No groups yet. Open Manage Group to create your first group.'
                : 'Use Manage Group to edit your groups, invite students, or leave member groups.'}
            </p>
            <section className="gateway-card" aria-label="GitHub connection">
              <h2>GitHub Connection</h2>
              <p className="gateway-copy">
                {githubConnection.linked
                  ? `Linked as ${githubConnection.username || 'GitHub user'}.`
                  : 'Your GitHub account is not linked yet.'}
              </p>
              {!githubConnection.linked && (
                <button
                  type="button"
                  className="workspace-button workspace-button-primary"
                  onClick={handleGitHubLink}
                  disabled={githubLinkPending}
                >
                  {githubLinkPending ? 'Redirecting...' : 'Connect GitHub'}
                </button>
              )}
            </section>
            <div className="workspace-actions">
              <Link className="workspace-button workspace-button-primary" to="/students/groups/manage">
                Manage Group
              </Link>
              <Link className="workspace-button workspace-button-secondary" to="/students/notifications">
                Notifications
              </Link>
            </div>
          </section>
        ) : (
          <>
            {role === 'PROFESSOR' ? (
              <section className="student-home-panel">
                <p><strong>Inbox:</strong> Advisor request notifications</p>
                <p className="student-home-note">
                  Review incoming advisor requests from team leaders without leaving the workspace.
                </p>
                <div className="workspace-actions">
                  <Link className="workspace-button workspace-button-primary" to="/professors/notifications">
                    Advisor Requests
                  </Link>
                  <Link className="workspace-button workspace-button-secondary" to="/professors/password-setup">
                    Password Setup
                  </Link>
                </div>
              </section>
            ) : (
              <div className="main-empty-canvas" />
            )}
          </>
        )}
      </section>
    </main>
  );
}
