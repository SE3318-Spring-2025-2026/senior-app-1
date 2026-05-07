import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const initialFeedback = { status: '', title: '', result: '' };

function CriterionRow({ criterion, value, onChange, disabled }) {
  const isBinary = criterion.criterionType === 'BINARY';
  const isChecked = value === criterion.maxPoints;

  if (isBinary) {
    return (
      <div className="field">
        <span>
          {criterion.question}
          <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>
            BINARY · max {criterion.maxPoints} pts · weight {criterion.weight}
          </span>
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: disabled ? 'not-allowed' : 'pointer', padding: '4px 0' }}>
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => onChange(e.target.checked ? criterion.maxPoints : 0)}
            disabled={disabled}
            style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'inherit', flexShrink: 0 }}
          />
          <span style={{ color: isChecked ? 'var(--accent-strong)' : 'var(--muted)', fontWeight: isChecked ? 600 : 400 }}>
            {isChecked
              ? `Yes — ${criterion.maxPoints} / ${criterion.maxPoints} pts`
              : `No — 0 / ${criterion.maxPoints} pts`}
          </span>
        </label>
      </div>
    );
  }

  return (
    <div className="field">
      <span>
        {criterion.question}
        <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>
          SOFT · max {criterion.maxPoints} pts · weight {criterion.weight}
        </span>
      </span>
      <input
        type="number"
        min={0}
        max={criterion.maxPoints}
        step={0.5}
        value={value}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          const clamped = Number.isNaN(raw)
            ? 0
            : Math.min(criterion.maxPoints, Math.max(0, raw));
          onChange(clamped);
        }}
        disabled={disabled}
        aria-label={`Score for ${criterion.question}`}
      />
      <div className="field-help">
        {value} / {criterion.maxPoints} pts entered
        {value > criterion.maxPoints && (
          <span style={{ color: 'var(--error-ink)', marginLeft: '8px' }}>
            Exceeds maximum — will be clamped to {criterion.maxPoints}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CommitteeGradingPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotification();
  const submissionType = location.state?.submissionType;

  const [criteria, setCriteria] = useState([]);
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState('');
  const [feedback, setFeedback] = useState(initialFeedback);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finalScore, setFinalScore] = useState(null);

  const token = window.localStorage.getItem('professorToken') || window.localStorage.getItem('authToken');

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in as a professor.' });
      navigate('/login', { replace: true });
      return;
    }

    async function loadCriteria() {
      try {
        const url = submissionType
          ? `/v1/committee/rubric-criteria?deliverableType=${submissionType}`
          : '/v1/committee/rubric-criteria';
        const res = await apiClient.get(url);
        const loaded = res.data?.criteria || [];
        setCriteria(loaded);
        const initialScores = {};
        loaded.forEach((c) => { initialScores[c.id] = 0; });
        setScores(initialScores);
      } catch (err) {
        setFeedback({
          status: 'error',
          title: 'Load Failed',
          result: err.response?.data?.message || 'Failed to load rubric criteria.',
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadCriteria();
  }, [navigate, notify, token, submissionType]);

  function handleScoreChange(criterionId, value) {
    setScores((current) => ({ ...current, [criterionId]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFeedback({ status: 'loading', title: '', result: '' });
    setIsSubmitting(true);

    const scoreArray = criteria.map((c) => ({
      criterionId: c.id,
      value: c.maxPoints > 0 ? Math.min(1, (scores[c.id] ?? 0) / c.maxPoints) : 0,
    }));

    try {
      const res = await apiClient.post(`/v1/committee/submissions/${submissionId}/grade`, {
        gradeType: 'COMMITTEE_FINAL',
        scores: scoreArray,
        comments: comments.trim() || undefined,
      });

      const score = res.data?.data?.finalScore;
      const displayScore = score !== undefined ? score * 100 : null;
      setFinalScore(displayScore);
      setFeedback({
        status: 'success',
        title: 'Review Submitted',
        result: `Final score: ${displayScore !== null ? displayScore.toFixed(1) : '—'} / 100`,
      });
      setSubmitted(true);
    } catch (err) {
      const errorData = err.response?.data || {};
      setFeedback({
        status: 'error',
        title: errorData.code || 'Submission Failed',
        result: errorData.message || 'Failed to submit review.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="feedback feedback-loading">
          <h2>Loading rubric...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="back-link-wrap">
        <Link className="back-link" to="/professors/committee-submissions">
          ← Back to Submissions
        </Link>
      </div>

      <div className="hero">
        <p className="eyebrow">Committee Review</p>
        <h1>Grade Submission</h1>
        <p className="subtitle">
          Score each rubric criterion, leave optional comments, then submit your review.
        </p>
      </div>

      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          {criteria.length === 0 && !feedback.status && (
            <div className="feedback feedback-warning" role="status" aria-live="polite">
              <div className="feedback-label">notice</div>
              <h2>No Rubric Criteria</h2>
              <p>No grading criteria are configured. Contact the coordinator.</p>
            </div>
          )}

          {criteria.map((criterion) => (
            <CriterionRow
              key={criterion.id}
              criterion={criterion}
              value={scores[criterion.id] ?? 0}
              onChange={(val) => handleScoreChange(criterion.id, val)}
              disabled={isSubmitting || submitted}
            />
          ))}

          {criteria.length > 0 && (
            <label className="field">
              <span>General Comments</span>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Optional comments about the submission..."
                disabled={isSubmitting || submitted}
              />
            </label>
          )}

          {criteria.length > 0 && (
            <button
              type="submit"
              disabled={isSubmitting || submitted}
            >
              {isSubmitting ? 'Submitting Review...' : submitted ? 'Review Submitted' : 'Submit Review'}
            </button>
          )}
        </form>

        <div className="side-column">
          {feedback.status && (
            <div className={`feedback feedback-${feedback.status}`} aria-live="polite">
              <div className="feedback-label">{feedback.status}</div>
              {feedback.title && <h2>{feedback.title}</h2>}
              <p>{feedback.result}</p>
              {submitted && (
                <div style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => navigate('/professors/committee-submissions')}
                  >
                    Back to Submissions
                  </button>
                </div>
              )}
            </div>
          )}

          {criteria.length > 0 && !submitted && (
            <div className="feedback feedback-idle">
              <div className="feedback-label">scoring guide</div>
              <h2>Rubric Summary</h2>
              {criteria.map((c) => (
                <div key={c.id} style={{ marginBottom: '10px' }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.9rem' }}>{c.question}</p>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
                    {c.criterionType} · {c.maxPoints} pts · weight {(c.weight * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
            </div>
          )}

          {submitted && finalScore !== null && (
            <div className="feedback feedback-idle">
              <div className="feedback-label">result</div>
              <h2 style={{ fontSize: '3rem', color: 'var(--accent-strong)' }}>
                {finalScore.toFixed(1)}
              </h2>
              <p style={{ color: 'var(--muted)' }}>out of 100</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
