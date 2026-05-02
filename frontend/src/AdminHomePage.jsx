import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

function getAdminName() {
  try {
    const storedUser = window.localStorage.getItem('adminUser');
    if (!storedUser) {
      return 'Admin';
    }

    const parsed = JSON.parse(storedUser);
    return parsed.fullName || parsed.email || 'Admin';
  } catch {
    return 'Admin';
  }
}

const adminTools = [
  {
    eyebrow: 'Accounts',
    title: 'Add Professor',
    description: 'Create a professor account and generate the first-time password setup details.',
    href: '/admin/professors/new',
    cta: 'Open Add Professor',
    status: 'Ready',
  },
  {
    eyebrow: 'Registry',
    title: 'Add Coordinator',
    description: 'Create a coordinator account that can manage student ID imports and manual group membership edits.',
    href: '/admin/coordinators/new',
    cta: 'Open Add Coordinator',
    status: 'Ready',
  },
  {
    eyebrow: 'Groups',
    title: 'Group Cleanup',
    description: 'Delete orphan groups from the group database when they no longer have an assigned advisor.',
    href: '/admin/groups/cleanup',
    cta: 'Open Cleanup Tool',
    status: 'Ready',
  },
  {
    eyebrow: 'Compliance',
    title: 'Audit Logs',
    description: 'Inspect recorded actions and trace actor, target, and metadata from the admin workspace.',
    href: '/admin/audit-logs',
    cta: 'Open Audit Logs',
    status: 'Ready',
  },
];

export default function AdminHomePage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const adminName = getAdminName();
  const token = window.localStorage.getItem('adminToken') || '';

  useEffect(() => {
    if (token) {
      return;
    }

    notify({
      type: 'warning',
      title: 'Admin login required',
      message: 'Please sign in before opening the admin workspace.',
    });
    navigate('/login', { replace: true });
  }, [navigate, notify, token]);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Admin Workspace</p>
        <h1>{adminName}</h1>
        <p className="subtitle">
          Choose the admin action you want to continue with. New admin tools can be added here without changing the
          login flow.
        </p>
      </section>

      <section className="gateway-grid">
        {adminTools.map((tool) => (
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
