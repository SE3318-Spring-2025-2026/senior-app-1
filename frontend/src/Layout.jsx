import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <nav>
          <Link to="/" className="nav-link">Student Registration</Link>
          <Link to="/coordinator/upload" className="nav-link">Coordinator: Valid Student ID Upload</Link>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
