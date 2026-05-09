import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

function Section({ title, children }) {
  return (
    <div className="panel" style={{ marginBottom: '24px' }}>
      <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem', fontWeight: 600 }}>{title}</h2>
      {children}
    </div>
  );
}

function GradeRow({ label, grade }) {
  if (!grade) return <p style={{ color: 'var(--muted)' }}>No {label.toLowerCase()} grade submitted yet.</p>;
  return (
    <div style={{ marginBottom: '8px' }}>
      <span style={{ fontWeight: 500 }}>{label}:</span>{' '}
      <span style={{ color: 'var(--accent-strong)', fontWeight: 700 }}>
        {(grade.finalScore * 100).toFixed(1)} / 100
      </span>
      {grade.comments && <span style={{ color: 'var(--muted)', marginLeft: '8px', fontSize: '0.85rem' }}>"{grade.comments}"</span>}
    </div>
  );
}

export default function FinalEvaluationDashboardPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('coordinatorToken') || window.localStorage.getItem('authToken');

  const [rawGrades, setRawGrades] = useState(null);
  const [scalar, setScalar] = useState(null);
  const [contributions, setContributions] = useState(null);
  const [finalGrades, setFinalGrades] = useState(null);

  const [isCalculatingScalar, setIsCalculatingScalar] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [scalarError, setScalarError] = useState(null);
  const [finalizeError, setFinalizeError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [gradesRes, scalarRes, contribRes, finalRes] = await Promise.allSettled([
        apiClient.get(`/v1/final-evaluation/groups/${groupId}/grades`),
        apiClient.get(`/v1/final-evaluation/groups/${groupId}/team-scalar`),
        apiClient.get(`/v1/final-evaluation/groups/${groupId}/contributions`),
        apiClient.get(`/v1/final-evaluation/groups/${groupId}/final-grades`),
      ]);

      if (gradesRes.status === 'fulfilled') setRawGrades(gradesRes.value.data.data);
      if (scalarRes.status === 'fulfilled') setScalar(scalarRes.value.data.data);
      if (contribRes.status === 'fulfilled') setContributions(contribRes.value.data.data);
      if (finalRes.status === 'fulfilled') setFinalGrades(finalRes.value.data.data);
    } catch {
      // individual failures handled above via allSettled
    }
  }, [groupId]);

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in as coordinator.' });
      navigate('/login', { replace: true });
      return;
    }
    load();
  }, [load, navigate, notify, token]);

  async function handleCalculateScalar() {
    setIsCalculatingScalar(true);
    setScalarError(null);
    try {
      const res = await apiClient.post(`/v1/final-evaluation/groups/${groupId}/team-scalar`);
      setScalar(res.data.data);
    } catch (err) {
      setScalarError(err.response?.data?.message || 'Failed to calculate team scalar.');
    } finally {
      setIsCalculatingScalar(false);
    }
  }

  async function handleFinalize() {
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      const res = await apiClient.post(`/v1/final-evaluation/groups/${groupId}/finalize`);
      setFinalGrades(res.data.data);
    } catch (err) {
      setFinalizeError(err.response?.data?.message || 'Failed to finalize grades.');
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <div className="page">
      <div className="back-link-wrap">
        <Link className="back-link" to="/coordinator/final-evaluation/groups">← Back to Groups</Link>
      </div>

      <div className="hero">
        <p className="eyebrow">Final Evaluation</p>
        <h1>Evaluation Dashboard</h1>
        <p className="subtitle" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{groupId}</p>
      </div>

      {/* 6.1 Raw Grades */}
      <Section title="6.1 — Raw Grades (Advisor &amp; Committee)">
        {rawGrades ? (
          <>
            <GradeRow label="Advisor Grade" grade={rawGrades.advisorGrade} />
            {rawGrades.committeeGrades?.length > 0
              ? rawGrades.committeeGrades.map((g, i) => (
                  <GradeRow key={g.id || i} label={`Committee Grade #${i + 1}`} grade={g} />
                ))
              : <p style={{ color: 'var(--muted)' }}>No committee grades submitted yet.</p>
            }
          </>
        ) : (
          <p style={{ color: 'var(--muted)' }}>No grades found for this group.</p>
        )}
      </Section>

      {/* 6.2 Team Scalar */}
      <Section title="6.2 — Team Scalar">
        {scalar ? (
          <div style={{ marginBottom: '12px' }}>
            <p>
              <span style={{ fontWeight: 500 }}>Scalar:</span>{' '}
              <span style={{ color: 'var(--accent-strong)', fontWeight: 700, fontSize: '1.4rem' }}>
                {(scalar.scalar * 100).toFixed(1)}
              </span>
              {' / 100'}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Advisor score: {scalar.advisorFinalScore != null ? (scalar.advisorFinalScore * 100).toFixed(1) : '—'} |{' '}
              Committee score: {scalar.committeeFinalScore != null ? (scalar.committeeFinalScore * 100).toFixed(1) : '—'} |{' '}
              Calculated: {scalar.calculatedAt ? new Date(scalar.calculatedAt).toLocaleString() : '—'}
            </p>
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', marginBottom: '12px' }}>Team scalar not yet calculated.</p>
        )}
        {scalarError && <div className="feedback feedback-error"><p>{scalarError}</p></div>}
        <button onClick={handleCalculateScalar} disabled={isCalculatingScalar} style={{ marginTop: '8px' }}>
          {isCalculatingScalar ? 'Calculating...' : scalar ? 'Recalculate Scalar' : 'Calculate Scalar'}
        </button>
      </Section>

      {/* 6.3 Individual Contributions */}
      <Section title="6.3 — Individual Contributions">
        {contributions && Array.isArray(contributions.members) && contributions.members.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>User ID</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Story Points</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Commits</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Contribution %</th>
              </tr>
            </thead>
            <tbody>
              {contributions.members.map((m) => (
                <tr key={m.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.userId}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.storyPointsCompleted ?? '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.commitCount ?? '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                    {m.contributionRatio != null ? `${m.contributionRatio.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)' }}>
            {contributions === null
              ? 'No sprint sync data available for this group.'
              : 'No contribution data found.'}
          </p>
        )}
      </Section>

      {/* 6.4 Final Grades */}
      <Section title="6.4 — Final Grades">
        {finalGrades && finalGrades.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>User ID</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Team Scalar</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Contribution %</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Final Score</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Letter</th>
              </tr>
            </thead>
            <tbody>
              {finalGrades.map((g) => (
                <tr key={g.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{g.userId}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{g.teamScalar?.toFixed(1) ?? '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{g.contributionRatio?.toFixed(1) ?? '—'}%</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{g.finalScore?.toFixed(1) ?? '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-strong)' }}>
                    {g.letterGrade ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)', marginBottom: '12px' }}>Final grades not yet computed.</p>
        )}
        {finalizeError && <div className="feedback feedback-error" style={{ marginTop: '12px' }}><p>{finalizeError}</p></div>}
        {(!finalGrades || finalGrades.length === 0) && (
          <button onClick={handleFinalize} disabled={isFinalizing} style={{ marginTop: '8px' }}>
            {isFinalizing ? 'Finalizing...' : 'Finalize Grades'}
          </button>
        )}
      </Section>
    </div>
  );
}
