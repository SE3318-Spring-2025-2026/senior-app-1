import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from './services/apiClient';

const LETTER_COLOR = {
  A: '#1f9e4a',
  B: '#3a7bd5',
  C: '#d9822b',
  D: '#c92a2a',
  F: '#c92a2a',
};

/**
 * Shows the logged-in student their finalised grade.
 * Backend: GET /v1/final-evaluation/my-grade returns
 *   { userId, groupId, finalScore, letterGrade, finalizedAt }
 * 200 → render the card
 * 404 GROUP_NOT_FOUND → student has no group yet
 * 404 GRADE_NOT_FOUND → coordinator hasn't finalised the group's grades yet
 */
export default function StudentMyGradePage() {
  const [grade, setGrade] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/v1/final-evaluation/my-grade');
      setGrade(res.data);
    } catch (err) {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message;
      if (code === 'GROUP_NOT_FOUND') {
        setError({ kind: 'no-group', text: 'You are not a member of any group yet. Join or create one in Manage Group.' });
      } else if (code === 'GRADE_NOT_FOUND') {
        setError({ kind: 'pending', text: msg || 'Coordinator has not finalised your group\'s grades yet. Check back later.' });
      } else {
        setError({ kind: 'error', text: msg || err.message || 'Failed to load grade.' });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="page page-group-view">
      <section className="hero">
        <p className="eyebrow">Final Evaluation</p>
        <h1>My Grade</h1>
        <p className="subtitle">
          Your finalised grade for this term, computed from your group's team scalar
          and your individual contribution ratio. The coordinator publishes it after
          all sprint deliverables are graded.
        </p>
        <p>
          <button type="button" onClick={load} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Loading…' : '🔄 Refresh'}
          </button>
        </p>
      </section>

      {loading && (
        <section className="group-details-card">
          <div className="feedback feedback-loading">
            <div className="feedback-label">loading</div>
            <p>Fetching your grade…</p>
          </div>
        </section>
      )}

      {!loading && error && (
        <section className="group-details-card">
          <div className={`feedback feedback-${error.kind === 'pending' ? 'idle' : 'error'}`}>
            <div className="feedback-label">{error.kind === 'pending' ? 'pending' : error.kind === 'no-group' ? 'no group' : 'error'}</div>
            <h2 style={{ marginTop: 0 }}>
              {error.kind === 'pending' ? 'Grade not finalised yet'
                : error.kind === 'no-group' ? 'You are not in a group'
                : 'Could not load grade'}
            </h2>
            <p>{error.text}</p>
            {error.kind === 'no-group' && (
              <p>
                <Link to="/students/groups/manage">Go to Manage Group →</Link>
              </p>
            )}
          </div>
        </section>
      )}

      {!loading && grade && (
        <>
          <section className="group-details-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  background: LETTER_COLOR[grade.letterGrade] || '#888',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '4rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
                aria-label={`Letter grade ${grade.letterGrade}`}
              >
                {grade.letterGrade}
              </div>

              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Final score</p>
                <h2 style={{ fontSize: '3.5rem', margin: '4px 0', lineHeight: 1 }}>
                  {Number(grade.finalScore || 0).toFixed(1)}
                  <span style={{ fontSize: '1.2rem', color: 'var(--muted)', fontWeight: 400 }}> / 100</span>
                </h2>
                {grade.finalizedAt && (
                  <p style={{ margin: 0, color: 'var(--muted)' }}>
                    Finalised {new Date(grade.finalizedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="group-details-card">
            <h3 style={{ marginTop: 0 }}>How was this calculated?</h3>
            <ol style={{ marginLeft: 20 }}>
              <li>The advisor + committee grade each deliverable (proposal, SoW, demonstration). Each grade is 0–100.</li>
              <li>The system applies a coordinator-defined weight to combine advisor + committee → <strong>team scalar</strong> (the whole-group score).</li>
              <li>Your individual <strong>contribution ratio</strong> is computed from your story-point completion across sprints.</li>
              <li>Final score = <code>min(100, teamScalar × contributionRatio / 100)</code>, mapped to a letter grade (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F &lt; 60).</li>
            </ol>
            <p style={{ color: 'var(--muted)' }}>
              Group: <code>{grade.groupId}</code> · Member: <code>{grade.userId}</code>
            </p>
          </section>
        </>
      )}

      <p className="back-link-wrap">
        <Link className="back-link" to="/home">← Back to Home</Link>
      </p>
    </main>
  );
}
