import { Link } from 'react-router-dom';

const workspaceCards = [
  {
    role: 'Student',
    title: 'Student Workspace',
    description: 'Sign in to manage invitations, join groups, and continue project collaboration.',
    loginHref: '/students/login',
    registerHref: '/students/register',
    accent: 'student',
  },
  {
    role: 'Professor',
    title: 'Professor Workspace',
    description: 'Log in to review teams and complete advisor-side workflows and evaluations.',
    loginHref: '/professors/login',
    registerHref: '/professors/password-setup',
    accent: 'professor',
  },
  {
    role: 'Coordinator',
    title: 'Coordinator Workspace',
    description: 'Sign in to manage student ID registry imports and coordinator control tools.',
    loginHref: '/coordinator/login',
    registerHref: '/coordinator/student-id-registry/import',
    accent: 'coordinator',
  },
  {
    role: 'Admin',
    title: 'Admin Workspace',
    description: 'Sign in to control account setup and administrative operations.',
    loginHref: '/admin/login',
    registerHref: '/admin/professors/new',
    accent: 'admin',
  },
];

export default function AuthGatewayPage() {
  return (
    <main className="page gateway-home">
      <section className="home-hero">
        <div>
          <p className="eyebrow">Senior App Workspace</p>
          <h1>Run Everything From One Clean Home</h1>
          <p className="subtitle">
            Choose your role and jump straight into the right workflow. This home page is designed as a command center,
            not just a list of random login links.
          </p>

          <div className="hero-actions">
            <Link className="cta-primary" to="/students/login">
              Enter as Student
            </Link>
            <Link className="cta-secondary" to="/admin/login">
              Open Admin Panel
            </Link>
          </div>
        </div>

        <aside className="hero-rail" aria-label="Quick map">
          <h2>Quick Route Map</h2>
          <ul>
            <li>Student: Login or Register</li>
            <li>Professor: Password setup then login</li>
            <li>Coordinator: Login then import student IDs</li>
            <li>Admin: Login then create professor accounts</li>
          </ul>
        </aside>
      </section>

      <section className="workspace-grid" aria-label="Role workspaces">
        {workspaceCards.map((item) => (
          <article key={item.role} className={`workspace-card workspace-card-${item.accent}`}>
            <p className="workspace-eyebrow">{item.role}</p>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <div className="workspace-actions">
              <Link className="workspace-button workspace-button-primary" to={item.loginHref}>
                Open Login
              </Link>
              <Link className="workspace-button workspace-button-secondary" to={item.registerHref}>
                Open Next Step
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="home-footer-note">
        <p>
          Tip: if login succeeds but you stay on the page, refresh once and re-open your role workspace from the top nav.
        </p>
      </section>
    </main>
  );
}
