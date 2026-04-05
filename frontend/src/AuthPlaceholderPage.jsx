export default function AuthPlaceholderPage({ eyebrow, title, description }) {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="subtitle">{description}</p>
      </section>

      <section className="placeholder-panel">
        <p className="feedback-label">Page Scaffold</p>
        <h2>Ready for the next issue</h2>
        <p className="gateway-copy">
          This route is now part of the auth flow and can be opened from the main entry page. The actual form and
          backend integration can be plugged in here when its issue is implemented.
        </p>
        <a className="gateway-link" href="/">
          Back to Entry Page
        </a>
      </section>
    </main>
  );
}
