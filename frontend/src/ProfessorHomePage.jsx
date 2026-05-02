import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

function getProfessorName() {
  try {
    const storedUser = window.localStorage.getItem('professorUser');
    if (!storedUser) {
      return 'Professor';
    }

    const parsed = JSON.parse(storedUser);
    return parsed.fullName || parsed.email || 'Professor';
  } catch {
    return 'Professor';
  }
}

const professorTools = [
  {
    eyebrow: 'Inbox',
    title: 'Advisor Requests',
    description: 'Review incoming advisor requests from team leaders and open assigned groups from one place.',
    href: '/professors/notifications',
    cta: 'Open Advisor Inbox',
    status: 'Ready',
  },
  {
    eyebrow: 'Committee',
    title: 'Committee Review',
    description: 'Grade deliverable submissions by scoring each rubric criterion and submitting your committee review.',
    href: '/professors/committee-submissions',
    cta: 'Open Committee Grading',
    status: 'Ready',
  },
  {
    eyebrow: 'Account',
    title: 'Password Setup',
    description: 'Create or update the password used to sign in to the professor workspace.',
    href: '/professors/password-setup',
    cta: 'Open Password Setup',
    status: 'Ready',
  },
];

export default function ProfessorHomePage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const professorName = getProfessorName();
  const token = window.localStorage.getItem('professorToken') || '';

  useEffect(() => {
    if (token) {
      return;
    }

    notify({
      type: 'warning',
      title: 'Professor login required',
      message: 'Please sign in before opening the professor workspace.',
    });
    navigate('/login', { replace: true });
  }, [navigate, notify, token]);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Professor Workspace</p>
        <h1>{professorName}</h1>
        <p className="subtitle">
          Open your advisor inbox or manage your account setup from the professor workspace.
        </p>
      </section>

      <section className="gateway-grid">
        {professorTools.map((tool) => (
          <article key={tool.href} className="gateway-card">
            <p className="gateway-eyebrow">{tool.eyebrow}</p>
            <div className="gateway-header">
              <h2>{tool.title}</h2>
              <span className={`gateway-status gateway-status-${tool.status.toLowerCase()}`}>{tool.status}</span>
            </div>
            <p className="gateway-copy">{tool.description}</p>
            <Link className="gateway-link" to={tool.href}>
              {tool.cta}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
