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

const adminActions = [
  {
    title: 'Professor Registration',
    description: 'Create a professor base account and trigger the initial password setup flow.',
    href: '/admin/professors/register',
    cta: 'Open Professor Registration',
  },
];

export default function AdminHomePage() {
  const adminName = getAdminName();

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
        {adminActions.map((action) => (
          <article key={action.href} className="gateway-card">
            <p className="gateway-eyebrow">Admin Tool</p>
            <div className="gateway-header">
              <h2>{action.title}</h2>
              <span className="gateway-status gateway-status-ready">Ready</span>
            </div>
            <p className="gateway-copy">{action.description}</p>
            <a className="gateway-link" href={action.href}>
              {action.cta}
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}
