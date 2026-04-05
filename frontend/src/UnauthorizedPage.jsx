export default function UnauthorizedPage() {
  return (
    <main className="page">
      <section className="single-panel">
        <section className="feedback feedback-error" aria-live="polite">
          <p className="feedback-label">Access Control</p>
          <h1>Unauthorized Access</h1>
          <p>You do not have permission to open this page with the current session.</p>
          <a className="gateway-link" href="/">
            Return to access gateway
          </a>
        </section>
      </section>
    </main>
  );
}
