import { Link, NavLink, Outlet } from 'react-router-dom';
import NotificationViewport from './NotificationViewport';

const navItems = [
  { to: '/', label: 'Entry' },
  { to: '/students/register', label: 'Student Register' },
  { to: '/coordinator/student-id-registry/import', label: 'Coordinator Upload' },
  { to: '/admin/login', label: 'Admin Login' },
  { to: '/admin', label: 'Admin Workspace' },
];

export default function AppShell() {
  return (
    <>
      <NotificationViewport />
      <header className="app-shell">
        <div className="app-shell__inner">
          <Link className="app-brand" to="/">
            Senior App
          </Link>

          <nav className="app-nav" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `app-nav__link${isActive ? ' app-nav__link-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <Outlet />
    </>
  );
}
