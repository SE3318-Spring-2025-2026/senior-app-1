import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

const ROLE_CONFIG = {
  student: {
    title: 'Student Home',
    subtitle: 'You are signed in. Continue to manage your groups.',
    loginRoute: '/students/login',
    tokenKey: 'studentToken',
    userKey: 'studentUser',
    actionHref: '/students/groups/manage',
    actionLabel: 'Manage Group',
  },
  professor: {
    title: 'Professor Home',
    subtitle: 'You are signed in. This role home is intentionally minimal.',
    loginRoute: '/professors/login',
    tokenKey: 'professorToken',
    userKey: 'professorUser',
    actionHref: '/professors/password-setup',
    actionLabel: 'Password Setup Page',
  },
  coordinator: {
    title: 'Coordinator Home',
    subtitle: 'You are signed in. Continue to coordinator tools when needed.',
    loginRoute: '/coordinator/login',
    tokenKey: 'coordinatorToken',
    userKey: 'coordinatorUser',
    actionHref: '/coordinator/student-id-registry/import',
    actionLabel: 'Open Student ID Import',
  },
  admin: {
    title: 'Admin Home',
    subtitle: 'You are signed in. Continue to professor account management.',
    loginRoute: '/admin/login',
    tokenKey: 'adminToken',
    userKey: 'adminUser',
    actionHref: '/admin/professors/new',
    actionLabel: 'Create Professor Account',
  },
};

function readDisplayName(userKey, fallback) {
  try {
    const raw = window.localStorage.getItem(userKey);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return parsed.fullName || parsed.email || parsed.studentId || fallback;
  } catch {
    return fallback;
  }
}

export default function RoleHomePage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const config = ROLE_CONFIG[role || ''];

  useEffect(() => {
    if (!config) {
      navigate('/', { replace: true });
      return;
    }

    const token = window.localStorage.getItem(config.tokenKey);
    if (!token) {
      notify({
        type: 'warning',
        title: 'Login required',
        message: `Please log in before opening ${config.title}.`,
      });
      navigate(config.loginRoute, { replace: true });
    }
  }, [config, navigate, notify]);

  if (!config) {
    return null;
  }

  const displayName = readDisplayName(config.userKey, config.title);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Role Workspace</p>
        <h1>{displayName}</h1>
        <p className="subtitle">{config.subtitle}</p>
      </section>

      <section className="single-panel">
        <section className="gateway-card">
          <h2>{config.title}</h2>
          <p className="gateway-copy">Only essential navigation is shown here.</p>
          <div className="workspace-actions">
            <Link className="workspace-button workspace-button-primary" to={config.actionHref}>
              {config.actionLabel}
            </Link>
            <Link className="workspace-button workspace-button-secondary" to="/">
              Back to Hook Page
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
