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
      <section className="panel">
        <p>No additional admin tools are enabled on this page right now.</p>
      </section>
    </main>
  );
}
