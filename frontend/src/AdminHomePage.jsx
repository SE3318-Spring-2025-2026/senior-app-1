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
        {adminTools.map((tool) => (
          <article key={tool.href} className="gateway-card">
            <p className="gateway-eyebrow">{tool.eyebrow}</p>
            <div className="gateway-header">
              <h2>{tool.title}</h2>
              <span className={`gateway-status gateway-status-${tool.status.toLowerCase()}`}>{tool.status}</span>
            </div>
            <p className="gateway-copy">{tool.description}</p>
            <a className="gateway-link" href={tool.href}>
              {tool.cta}
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}
