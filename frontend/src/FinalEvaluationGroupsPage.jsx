import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

export default function FinalEvaluationGroupsPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('coordinatorToken') || window.localStorage.getItem('authToken');

  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in as coordinator.' });
      navigate('/login', { replace: true });
      return;
    }

    apiClient.get('/v1/coordinator/groups')
      .then((res) => {
        const data = res.data;
        setGroups(Array.isArray(data) ? data : (data.groups || data.data || []));
      })
      .catch(() => setError('Failed to load groups.'))
      .finally(() => setIsLoading(false));
  }, [navigate, notify, token]);

  if (isLoading) {
    return (
      <div className="page">
        <div className="feedback feedback-loading"><h2>Loading groups...</h2></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="back-link-wrap">
        <Link className="back-link" to="/coordinator">← Back to Coordinator Home</Link>
      </div>

      <div className="hero">
        <p className="eyebrow">Final Evaluation</p>
        <h1>Select a Group</h1>
        <p className="subtitle">
          Choose a group to review grades, calculate the team scalar, and finalize per-member grades.
        </p>
      </div>

      {error && (
        <div className="feedback feedback-error" aria-live="polite">
          <p>{error}</p>
        </div>
      )}

      {!error && groups.length === 0 && (
        <div className="feedback feedback-idle">
          <h2>No groups found</h2>
          <p>There are no groups in the system yet.</p>
        </div>
      )}

      {groups.length > 0 && (
        <div className="panel">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Group Name</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Members</th>
                <th style={{ padding: '8px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{group.name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '0.875rem' }}>{group.status}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '0.875rem' }}>
                    {Array.isArray(group.memberIds) ? group.memberIds.length : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <Link
                      to={`/coordinator/final-evaluation/groups/${group.id}`}
                      style={{ fontWeight: 500 }}
                    >
                      Open Dashboard →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
