import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

function CriterionRow({ criterion, value, onChange, disabled }) {
  return (
    <div className="field">
      <span>
        {criterion.question || criterion.name}
        <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>
          max {criterion.maxPoints} pts
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
          const clamped = Number.isNaN(raw) ? 0 : Math.min(criterion.maxPoints, Math.max(0, raw));
          onChange(clamped);
        }}
        disabled={disabled}
        aria-label={`Score for ${criterion.question || criterion.name}`}
      />
      <div className="field-help">{value} / {criterion.maxPoints} pts</div>
    </div>
  );
}

export default function CommitteeFinalGradePage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('professorToken') || window.localStorage.getItem('authToken');

  const [deliverables, setDeliverables] = useState([]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState('');
  const [criteria, setCriteria] = useState([]);
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState('');
  const [myExistingGrade, setMyExistingGrade] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in as professor.' });
      navigate('/login', { replace: true });
      return;
    }

    async function init() {
      try {
        const [deliverablesRes, gradesRes] = await Promise.allSettled([
          apiClient.get(`/v1/final-evaluation/groups/${groupId}/deliverables`),
          apiClient.get(`/v1/final-evaluation/groups/${groupId}/grades`),
        ]);

        let delivs = [];
        if (deliverablesRes.status === 'fulfilled') {
          delivs = deliverablesRes.value.data.data || [];
          setDeliverables(delivs);
        }

        if (gradesRes.status === 'fulfilled') {
          const committeeGrades = gradesRes.value.data.data?.committeeGrades || [];
          // We can't easily match by current user ID here without a /me endpoint,
          // so we just note if any committee grade exists for awareness
          if (committeeGrades.length > 0) setMyExistingGrade(committeeGrades[0]);
        }

        const firstDeliv = delivs[0];
        if (firstDeliv) {
          setSelectedDeliverableId(firstDeliv.id);
          await loadCriteria(firstDeliv.type);
        }
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [groupId, navigate, notify, token]);

  async function loadCriteria(deliverableType) {
    try {
      const res = await apiClient.get(`/v1/committee/rubric-criteria?deliverableType=${deliverableType}`);
      const loaded = res.data?.criteria || [];
      setCriteria(loaded);
      const init = {};
      loaded.forEach((c) => { init[c.id] = 0; });
      setScores(init);
    } catch {
      setCriteria([]);
    }
  }

  async function handleDeliverableChange(e) {
    const id = e.target.value;
    setSelectedDeliverableId(id);
    const deliv = deliverables.find((d) => d.id === id);
    if (deliv) await loadCriteria(deliv.type);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedDeliverableId) return;
    setIsSubmitting(true);
    setFeedback(null);

    const scoreArray = criteria.map((c) => ({
      criterionId: c.id,
      value: c.maxPoints > 0 ? Math.min(1, (scores[c.id] ?? 0) / c.maxPoints) : 0,
    }));

    const body = {
      deliverableId: selectedDeliverableId,
      scores: scoreArray,
      comments: comments.trim() || undefined,
    };

    try {
      const method = myExistingGrade ? 'put' : 'post';
      const res = await apiClient[method](`/v1/final-evaluation/groups/${groupId}/committee-grade`, body);
      setFeedback({
        type: 'success',
        message: `Committee grade ${myExistingGrade ? 'updated' : 'submitted'}. Final score: ${(res.data.data.finalScore * 100).toFixed(1)} / 100`,
      });
      setMyExistingGrade(res.data.data);
      setSubmitted(true);
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Submission failed.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="feedback feedback-loading"><h2>Loading...</h2></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="back-link-wrap">
        <Link className="back-link" to="/professors">← Back to Professor Home</Link>
      </div>

      <div className="hero">
        <p className="eyebrow">Final Evaluation · Committee Grade</p>
        <h1>Submit Committee Grade</h1>
        <p className="subtitle" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>Group: {groupId}</p>
      </div>

      {myExistingGrade && !submitted && (
        <div className="feedback feedback-idle" style={{ marginBottom: '16px' }}>
          <div className="feedback-label">existing grade</div>
          <p>A committee grade already exists for this group. Submitting again will add or update your grade.</p>
        </div>
      )}

      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          {deliverables.length > 1 && (
            <label className="field">
              <span>Deliverable</span>
              <select value={selectedDeliverableId} onChange={handleDeliverableChange} disabled={isSubmitting || submitted}>
                {deliverables.map((d) => (
                  <option key={d.id} value={d.id}>{d.type} {d.sprintNumber ? `(Sprint ${d.sprintNumber})` : ''}</option>
                ))}
              </select>
            </label>
          )}

          {deliverables.length === 0 && (
            <div className="feedback feedback-warning">
              <p>No deliverables found for this group. A deliverable must exist before grading.</p>
            </div>
          )}

          {criteria.length === 0 && deliverables.length > 0 && (
            <div className="feedback feedback-warning">
              <p>No rubric criteria configured. Ask the coordinator to set up grading criteria.</p>
            </div>
          )}

          {criteria.map((c) => (
            <CriterionRow
              key={c.id}
              criterion={c}
              value={scores[c.id] ?? 0}
              onChange={(val) => setScores((s) => ({ ...s, [c.id]: val }))}
              disabled={isSubmitting || submitted}
            />
          ))}

          {criteria.length > 0 && (
            <label className="field">
              <span>Comments (optional)</span>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Optional comments..."
                disabled={isSubmitting || submitted}
              />
            </label>
          )}

          {feedback && (
            <div className={`feedback feedback-${feedback.type}`} aria-live="polite">
              <p>{feedback.message}</p>
            </div>
          )}

          {criteria.length > 0 && deliverables.length > 0 && (
            <button type="submit" disabled={isSubmitting || submitted}>
              {isSubmitting ? 'Submitting...' : submitted ? 'Grade Submitted' : 'Submit Committee Grade'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
