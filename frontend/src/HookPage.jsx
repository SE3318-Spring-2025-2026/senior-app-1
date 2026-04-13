import { useState } from 'react';
import { Link } from 'react-router-dom';

const loginOptions = [
  { label: 'Student Login', href: '/students/login' },
  { label: 'Professor Login', href: '/professors/login' },
  { label: 'Coordinator Login', href: '/coordinator/login' },
  { label: 'Admin Login', href: '/admin/login' },
];

export default function HookPage() {
  const [open, setOpen] = useState(false);

  return (
    <main className="page hook-page">
      <header className="hook-topbar">
        <div className="hook-brand">
          <p className="eyebrow">Senior Project Platform</p>
          <h1>Plan. Build. Deliver.</h1>
        </div>

        <div className="hook-login-menu">
          <button
            type="button"
            className="hook-login-trigger"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="hook-login-options"
          >
            Login
          </button>

          {open && (
            <div id="hook-login-options" className="hook-login-dropdown" role="menu" aria-label="Login options">
              {loginOptions.map((option) => (
                <Link
                  key={option.href}
                  to={option.href}
                  role="menuitem"
                  className="hook-login-option"
                  onClick={() => setOpen(false)}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="hook-hero">
        <p className="hook-kicker">One focused flow</p>
        <h2>Sign in, open your role home, and continue.</h2>
        <p>
          This experience is intentionally minimal. Students can continue to group creation directly after login.
        </p>
        <div className="hook-cta-row">
          <Link to="/students/login" className="hook-primary-cta">
            Start as Student
          </Link>
          <Link to="/students/register" className="hook-secondary-cta">
            Register Student
          </Link>
        </div>
      </section>
    </main>
  );
}
