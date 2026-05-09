import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const LETTER_COLOR = { A: '#2a9d2a', B: '#3a7bd5', C: '#e6a817', D: '#e07b20', F: '#d32f2f' };

export default function StudentFinalGradePage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('authToken');

  const [grade, setGrade] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in to view your grade.' });
      navigate('/login', { replace: true });
      return;
    }

    apiClient.get('/v1/final-evaluation/my-grade')
      .then((res) => {
        const data = res.data;
        if (!data || (!data.finalScore && data.finalScore !== 0)) {
          setNotReady(true);
        } else {
          setGrade(data);
        }
      })
      .catch((err) => {
        if (err.response?.status === 404 || err.response?.data?.code === 'GRADE_NOT_FOUND') {
          setNotReady(true);
        } else {
          setError('Failed to load your final grade.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [navigate, notify, token]);

  if (isLoading) {
    return (
      <div className="page">
        <div className="feedback feedback-loading"><h2>Loading your grade...</h2></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="back-link-wrap">
        <Link className="back-link" to="/students/groups/manage">← Back to My Group</Link>
      </div>

      <div className="hero">
        <p className="eyebrow">Final Evaluation</p>
        <h1>Your Final Grade</h1>
        <p className="subtitle">Your computed final grade for this semester.</p>
      </div>

      {error && (
        <div className="feedback feedback-error" aria-live="polite">
          <p>{error}</p>
        </div>
      )}

      {notReady && (
        <div className="feedback feedback-idle">
          <div className="feedback-label">not yet available</div>
          <h2>Grades Not Finalized</h2>
          <p>Your final grade has not been computed yet. Check back after the coordinator finalizes grades.</p>
        </div>
      )}

      {grade && (
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '32px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', color: 'var(--muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Letter Grade</p>
              <span style={{
                display: 'block',
                fontSize: '5rem',
                fontWeight: 800,
                lineHeight: 1,
                color: LETTER_COLOR[grade.letterGrade] || 'var(--accent-strong)',
              }}>
                {grade.letterGrade}
              </span>
            </div>

            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 4px', color: 'var(--muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Final Score</p>
                <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>
                  {grade.finalScore?.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>/ 100</span>
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Team Scalar</p>
                  <p style={{ margin: 0, fontWeight: 600 }}>{grade.teamScalar?.toFixed(1) ?? '—'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Contribution</p>
                  <p style={{ margin: 0, fontWeight: 600 }}>{grade.contributionRatio?.toFixed(1) ?? '—'}%</p>
                </div>
              </div>

              {grade.finalizedAt && (
                <p style={{ marginTop: '16px', color: 'var(--muted)', fontSize: '0.8rem' }}>
                  Finalized {new Date(grade.finalizedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <div className="feedback feedback-idle" style={{ marginTop: '20px' }}>
            <div className="feedback-label">how it&apos;s calculated</div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
              Final Score = Team Scalar × (Your Contribution % / 100), capped at 100.
              Team Scalar is a weighted blend of advisor and committee grades.
              Contribution is based on your story points relative to the total team output.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
