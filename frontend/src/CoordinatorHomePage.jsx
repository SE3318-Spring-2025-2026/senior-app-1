import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

function getCoordinatorName() {
  try {
    const storedUser = window.localStorage.getItem('coordinatorUser');
    if (!storedUser) {
      return 'Coordinator';
    }

    const parsed = JSON.parse(storedUser);
    return parsed.fullName || parsed.email || 'Coordinator';
  } catch {
    return 'Coordinator';
  }
}

const coordinatorTools = [
  {
    eyebrow: 'Registry',
    title: 'Import Valid Student IDs',
    description: 'Upload the student ID registry in bulk and review inserted, duplicate, and invalid totals.',
    href: '/coordinator/student-id-registry/import',
    cta: 'Open Import Tool',
    status: 'Ready',
  },
  {
    eyebrow: 'Group Formation',
    title: 'Manual group membership (D2)',
    description: 'Coordinator override: add or remove a student from a group by id (f15 / f19).',
    href: '/coordinator/groups/membership',
    cta: 'Open Membership Tool',
    status: 'Ready',
  },
];

export default function CoordinatorHomePage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const coordinatorName = getCoordinatorName();
  const token = window.localStorage.getItem('coordinatorToken') || '';

  useEffect(() => {
    if (token) {
      return;
    }

    notify({
      type: 'warning',
      title: 'Coordinator login required',
      message: 'Please sign in before opening the coordinator workspace.',
    });
    navigate('/coordinator/login', { replace: true });
  }, [navigate, notify, token]);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Coordinator Workspace</p>
        <h1>{coordinatorName}</h1>
        <p className="subtitle">
          Choose the coordinator action you want to continue with. More coordinator tools can be added here without
          changing the sign-in flow.
        </p>
      </section>

      <section className="gateway-grid">
        {coordinatorTools.map((tool) => (
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
