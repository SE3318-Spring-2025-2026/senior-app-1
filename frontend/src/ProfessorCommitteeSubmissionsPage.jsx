import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function statusBadgeStyle(status) {
  if (status === 'UNDER_REVIEW') return { color: '#fde68a', background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.28)' };
  return { color: '#b6f0f4', background: 'rgba(56,195,204,0.12)', border: '1px solid rgba(56,195,204,0.28)' };
}

export default function ProfessorCommitteeSubmissionsPage() {
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { notify } = useNotification();
  const navigate = useNavigate();

  const token = window.localStorage.getItem('professorToken') || window.localStorage.getItem('authToken');

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in as a professor.' });
      navigate('/login', { replace: true });
      return;
    }

    async function load() {
      try {
        const res = await apiClient.get('/v1/committee/submissions');
        setSubmissions(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch (err) {
        notify({
          type: 'error',
          title: 'Load Failed',
          message: err.response?.data?.message || 'Failed to load pending submissions.',
        });
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [navigate, notify, token]);

  if (isLoading) {
    return (
      <div className="page">
        <div className="feedback feedback-loading">
          <h2>Loading submissions...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <p className="eyebrow">Committee Review</p>
        <h1>Pending Submissions</h1>
        <p className="subtitle">
          Select a submission below to open the grading form and submit your criterion scores.
        </p>
      </div>

      <div className="single-panel">
        {submissions.length === 0 ? (
          <div className="feedback feedback-idle">
            <div className="feedback-label">empty</div>
            <h2>No Pending Submissions</h2>
            <p>There are no submissions awaiting committee review at this time.</p>
          </div>
        ) : (
          <div className="audit-log-list">
            {submissions.map((submission) => (
              <div key={submission.id} className="audit-log-card">
                <div className="audit-log-topline">
                  <span className="audit-log-action">{submission.type}</span>
                  <span className="audit-log-time">{formatDate(submission.submittedAt)}</span>
                </div>

                <div className="audit-log-grid">
                  <div>
                    <p className="audit-log-label">Submission ID</p>
                    <p className="audit-log-value" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>
                      {submission.id}
                    </p>
                  </div>
                  <div>
                    <p className="audit-log-label">Status</p>
                    <p className="audit-log-value">
                      <span
                        style={{
                          display: 'inline-block',
                          borderRadius: '999px',
                          padding: '3px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          ...statusBadgeStyle(submission.status),
                        }}
                      >
                        {submission.status}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="audit-log-label">Group</p>
                    <p className="audit-log-value" style={{ fontSize: '0.88rem' }}>
                      {submission.groupName ?? submission.groupId}
                    </p>
                  </div>
                  {submission.sprintNumber != null && (
                    <div>
                      <p className="audit-log-label">Sprint</p>
                      <p className="audit-log-value">Sprint {submission.sprintNumber}</p>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '16px' }}>
                  <Link
                    to={`/professors/committee-review/${submission.id}`}
                    state={{ submissionType: submission.type }}
                    className="gateway-link"
                    style={{ display: 'inline-flex', minWidth: '180px' }}
                  >
                    Grade This Submission
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
