const entryPoints = [
  {
    eyebrow: 'Student',
    title: 'Student Login',
    description: 'Returning students sign in here before continuing with team, GitHub, and sprint workflows.',
    href: '/students/login',
    cta: 'Open Student Login',
    status: 'Planned',
  },
  {
    eyebrow: 'Student',
    title: 'Student Register',
    description: 'New students validate their uploaded student ID and create their base account here.',
    href: '/students/register',
    cta: 'Open Student Register',
    status: 'Ready',
  },
  {
    eyebrow: 'Professor',
    title: 'Professor Login',
    description: 'Professors authenticate here after completing their initial password setup flow.',
    href: '/professors/login',
    cta: 'Open Professor Login',
    status: 'Planned',
  },
  {
    eyebrow: 'Professor',
    title: 'Professor Setup Password',
    description: 'A newly created professor account completes its first-time password setup with the one-time token flow.',
    href: '/professors/password-setup',
    cta: 'Open Password Setup',
    status: 'Planned',
  },
  {
    eyebrow: 'Admin',
    title: 'Admin Login',
    description: 'Admins sign in here before accessing admin-only tools such as professor account registration.',
    href: '/admin/login',
    cta: 'Open Admin Login',
    status: 'Planned',
  },
];

export default function AuthGatewayPage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Senior App Access</p>
        <h1>Choose an entry point</h1>
        <p className="subtitle">
          The system has separate student, professor, and admin-facing auth flows. This landing page keeps those
          routes visible and easy to demo without mixing the screens together.
        </p>
      </section>

      <section className="gateway-grid">
        {entryPoints.map((item) => (
          <article key={item.href} className="gateway-card">
            <p className="gateway-eyebrow">{item.eyebrow}</p>
            <div className="gateway-header">
              <h2>{item.title}</h2>
              <span className={`gateway-status gateway-status-${item.status.toLowerCase()}`}>{item.status}</span>
            </div>
            <p className="gateway-copy">{item.description}</p>
            <a className="gateway-link" href={item.href}>
              {item.cta}
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}
