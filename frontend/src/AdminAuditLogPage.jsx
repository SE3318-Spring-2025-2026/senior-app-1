import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    action: '',
    targetType: '',
    limit: '150',
  });

  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('adminToken') || '';

  useEffect(() => {
    if (token) {
      return;
    }

    notify({
      type: 'warning',
      title: 'Admin login required',
      message: 'Please sign in before opening audit logs.',
    });
    navigate('/login', { replace: true });
  }, [navigate, notify, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    async function loadLogs() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();
        params.set('limit', filters.limit || '150');
        if (filters.action.trim()) params.set('action', filters.action.trim());
        if (filters.targetType.trim()) params.set('targetType', filters.targetType.trim());
        const { data: payload } = await apiClient.get(`/v1/admin/audit-logs?${params.toString()}`);
        setLogs(Array.isArray(payload.data) ? payload.data : []);
      } catch (loadError) {
        setLogs([]);
        setError(loadError.response?.data?.message || loadError.message || 'Audit logs could not be loaded.');
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, [token, filters.action, filters.limit, filters.targetType]);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Admin Workspace</p>
        <h1>Audit Logs</h1>
        <p className="subtitle">
          Review recorded system actions from a single admin-only activity stream.
        </p>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/admin">
          Back to Admin Workspace
        </Link>
      </p>

      <section className="single-panel">
        <form className="audit-filter-bar" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>Action</span>
            <input
              name="action"
              type="text"
              placeholder="POST_REQUEST"
              value={filters.action}
              onChange={handleFilterChange}
            />
          </label>

          <label className="field">
            <span>Target Type</span>
            <input
              name="targetType"
              type="text"
              placeholder="API_ROUTE"
              value={filters.targetType}
              onChange={handleFilterChange}
            />
          </label>

          <label className="field">
            <span>Limit</span>
            <select name="limit" value={filters.limit} onChange={handleFilterChange}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="150">150</option>
              <option value="250">250</option>
            </select>
          </label>
        </form>

        {loading && (
          <section className="feedback feedback-loading" aria-live="polite">
            <p className="feedback-label">Audit Feed</p>
            <h2>Loading</h2>
            <p>Fetching the latest audit log entries.</p>
          </section>
        )}

        {!loading && error && (
          <section className="feedback feedback-error" aria-live="polite">
            <p className="feedback-label">Audit Feed</p>
            <h2>Load failed</h2>
            <p>{error}</p>
          </section>
        )}

        {!loading && !error && logs.length === 0 && (
          <section className="feedback feedback-idle" aria-live="polite">
            <p className="feedback-label">Audit Feed</p>
            <h2>No logs yet</h2>
            <p>No audit records are available right now.</p>
          </section>
        )}

        {!loading && !error && logs.length > 0 && (
          <section className="audit-log-list" aria-label="Audit logs">
            {logs.map((entry) => (
              <article key={entry.id} className="audit-log-card">
                <div className="audit-log-topline">
                  <span className="audit-log-action">{entry.action}</span>
                  <span className="audit-log-time">{formatDate(entry.createdAt)}</span>
                </div>

                <div className="audit-log-grid">
                  <div>
                    <p className="audit-log-label">Actor</p>
                    <p className="audit-log-value">
                      {entry.actor?.fullName || entry.actor?.email || 'Unknown actor'}
                    </p>
                    <p className="audit-log-subvalue">
                      {entry.actor?.role || 'UNKNOWN'}
                      {entry.actor?.studentId ? ` • ${entry.actor.studentId}` : ''}
                    </p>
                  </div>

                  <div>
                    <p className="audit-log-label">Target</p>
                    <p className="audit-log-value">{entry.targetType}</p>
                    <p className="audit-log-subvalue">{entry.targetId}</p>
                  </div>
                </div>

                <pre className="audit-log-metadata">
                  {JSON.stringify(entry.metadata || {}, null, 2)}
                </pre>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
