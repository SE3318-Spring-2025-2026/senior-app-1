import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import NotificationViewport from './NotificationViewport';

const roleMenuSections = {
  Student: [
    {
      title: 'Workspace',
      items: [
        { to: '/home', label: 'Student Home', icon: 'HM' },
        { to: '/students/groups/manage', label: 'Manage Group', icon: 'GR' },
      ],
    },
  ],
  Professor: [
    {
      title: 'Workspace',
      items: [
        { to: '/professors', label: 'Professor Home', icon: 'HM' },
        { to: '/professors/notifications', label: 'Advisor Requests', icon: 'AR' },
        { to: '/professors/committee-submissions', label: 'Committee Review', icon: 'CR' },
      ],
    },
  ],
  Coordinator: [
    {
      title: 'Workspace',
      items: [
        { to: '/coordinator', label: 'Coordinator Home', icon: 'HM' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { to: '/coordinator/student-id-registry/import', label: 'Student ID Import', icon: 'OP' },
        { to: '/coordinator/groups/manage', label: 'Group Membership Edit', icon: 'GM' },
        { to: '/coordinator/groups/transfer', label: 'Advisor Transfer', icon: 'AT' },
        { to: '/coordinator/groups/cleanup', label: 'Group Cleanup', icon: 'GC' },
      ],
    },
  ],
  Admin: [
    {
      title: 'Workspace',
      items: [
        { to: '/admin', label: 'Admin Home', icon: 'HM' },
      ],
    },
    {
      title: 'Management',
      items: [
        { to: '/admin/professors/new', label: 'Create Professor Account', icon: 'MG' },
        { to: '/admin/coordinators/new', label: 'Create Coordinator Account', icon: 'CG' },
        { to: '/admin/groups/cleanup', label: 'Group Cleanup', icon: 'GC' },
        { to: '/admin/audit-logs', label: 'Audit Logs', icon: 'AL' },
      ],
    },
  ],
};

function readAuthenticatedUser() {
  const sources = [
    { userKey: 'adminUser', tokenKey: 'adminToken', fallbackRole: 'Admin' },
    { userKey: 'coordinatorUser', tokenKey: 'coordinatorToken', fallbackRole: 'Coordinator' },
    { userKey: 'professorUser', tokenKey: 'professorToken', fallbackRole: 'Professor' },
    { userKey: 'studentUser', tokenKey: 'studentToken', fallbackRole: 'Student' },
  ];

  for (const source of sources) {
    const raw = window.localStorage.getItem(source.userKey);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      const rawRole = (parsed.role || source.fallbackRole || '').toString();
      const role = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase();
      const rawName = parsed.fullName || parsed.name || parsed.username || parsed.email || parsed.studentId || role;
      const name = rawName.toString();
      return {
        label: name,
        role,
        initials: name.slice(0, 1).toUpperCase(),
      };
    } catch {
      return {
        label: source.fallbackRole,
        role: source.fallbackRole,
        initials: source.fallbackRole.slice(0, 1).toUpperCase(),
      };
    }
  }

  return null;
}

function homeRouteForViewer(role) {
  switch (role) {
    case 'Admin':
      return '/admin';
    case 'Coordinator':
      return '/coordinator';
    case 'Professor':
      return '/professors';
    case 'Student':
      return '/home';
    default:
      return '/';
  }
}

export default function AppShell() {
  const [openMenu, setOpenMenu] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const location = useLocation();
  const [authenticatedUser, setAuthenticatedUser] = useState(() => readAuthenticatedUser());

  useEffect(() => {
    setAuthenticatedUser(readAuthenticatedUser());
  }, [location.key]);

  const isAuthenticated = Boolean(authenticatedUser);
  const viewer = authenticatedUser || { label: 'Guest', role: 'Guest', initials: 'G' };
  const menuSections = isAuthenticated ? (roleMenuSections[authenticatedUser.role] || []) : [];

  function handleSignOut() {
    const keys = [
      'authToken',
      'adminToken', 'adminUser',
      'coordinatorToken', 'coordinatorUser',
      'professorToken', 'professorUser',
      'studentToken', 'studentUser',
    ];

    keys.forEach((key) => window.localStorage.removeItem(key));
    window.location.assign('/home');
  }

  return (
    <>
      <NotificationViewport />
      <header className="app-shell">
        <div className="app-shell__inner">
          <div className="app-shell-left">
            <div className="app-main-menu">
              <button
                type="button"
                className="app-menu-trigger"
                onClick={() => {
                  setOpenProfile(false);
                  setOpenMenu((current) => !current);
                }}
                aria-expanded={openMenu}
                aria-controls="app-main-drawer"
                aria-label="Open main menu"
              >
                <span aria-hidden="true">☰</span>
              </button>
            </div>

            <div className="app-brand-wrap">
              <Link className="app-brand" to={homeRouteForViewer(viewer.role)}>
                Senior App
              </Link>
              <span className="app-brand-subtitle">Home</span>
            </div>
          </div>

          <div className="app-header-actions">
            <div className="app-profile-menu">
              <button
                type="button"
                className="app-profile-trigger"
                onClick={() => {
                  setOpenMenu(false);
                  setOpenProfile((current) => !current);
                }}
                aria-expanded={openProfile}
                aria-controls="app-profile-dropdown"
              >
                <span className="app-profile-avatar" aria-hidden="true">
                  {viewer.initials}
                </span>
                <span className="app-profile-text">
                  <strong>{viewer.label}</strong>
                  <small>{viewer.role}</small>
                </span>
              </button>

              {openProfile && (
                <div id="app-profile-dropdown" className="app-profile-dropdown" role="menu" aria-label="Profile options">
                  {isAuthenticated ? (
                    <>
                      {authenticatedUser.role === 'Student' && (
                        <Link
                          to="/students/notifications"
                          role="menuitem"
                          className="app-profile-option"
                          onClick={() => setOpenProfile(false)}
                        >
                          Notifications
                        </Link>
                      )}

                      {authenticatedUser.role === 'Professor' && (
                        <>
                          <Link
                            to="/professors/notifications"
                            role="menuitem"
                            className="app-profile-option"
                            onClick={() => setOpenProfile(false)}
                          >
                            Advisor Requests
                          </Link>
                          <Link
                            to="/professors/password-setup"
                            role="menuitem"
                            className="app-profile-option"
                            onClick={() => setOpenProfile(false)}
                          >
                            Password Setup
                          </Link>
                        </>
                      )}

                      <button type="button" className="app-profile-option app-login-signout" onClick={handleSignOut}>
                        Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link to="/auth" role="menuitem" className="app-profile-option" onClick={() => setOpenProfile(false)}>
                        Login / Sign up
                      </Link>
                      <Link to="/students/login" role="menuitem" className="app-profile-option" onClick={() => setOpenProfile(false)}>
                        Student Login
                      </Link>
                      <Link to="/admin/login" role="menuitem" className="app-profile-option" onClick={() => setOpenProfile(false)}>
                        Admin Login
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {openMenu && (
        <button
          type="button"
          className="app-main-overlay"
          aria-label="Close menu"
          onClick={() => setOpenMenu(false)}
        />
      )}

      {
        <aside id="app-main-drawer" className={`app-main-drawer${openMenu ? ' app-main-drawer-open' : ''}`} aria-label="Main menu">
          <p className="app-main-drawer-label">{viewer.role} Menu</p>
          <p className="app-main-drawer-user">{viewer.label}</p>
          <div className="app-main-drawer-nav" aria-label="Workspace options">
            {menuSections.map((section) => (
              <section key={section.title} className="app-main-group" aria-label={section.title}>
                <nav className="app-main-group-items">
                  {section.items.map((item) => (
                    <NavLink key={item.to} to={item.to} className="app-main-option" onClick={() => setOpenMenu(false)}>
                      <span className="app-main-option-icon" aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </nav>
              </section>
            ))}
          </div>
        </aside>
      }

      <div className="app-main-content">
        <Outlet />
      </div>
    </>
  );
}
