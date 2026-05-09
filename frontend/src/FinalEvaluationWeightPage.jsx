import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

export default function FinalEvaluationWeightPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('coordinatorToken') || window.localStorage.getItem('authToken');

  const [advisorPct, setAdvisorPct] = useState('');
  const [committeePct, setCommitteePct] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in as coordinator.' });
      navigate('/login', { replace: true });
      return;
    }

    apiClient.get('/v1/final-evaluation/weight-configuration')
      .then((res) => {
        const { advisorWeight, committeeWeight } = res.data.data;
        setAdvisorPct(String(Math.round(advisorWeight * 100)));
        setCommitteePct(String(Math.round(committeeWeight * 100)));
      })
      .catch((err) => {
        if (err.response?.status !== 404) {
          setFeedback({ type: 'error', message: 'Failed to load current weight configuration.' });
        }
      })
      .finally(() => setIsLoading(false));
  }, [navigate, notify, token]);

  const sum = (parseFloat(advisorPct) || 0) + (parseFloat(committeePct) || 0);
  const sumOk = Math.abs(sum - 100) < 0.01;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!sumOk) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      await apiClient.put('/v1/final-evaluation/weight-configuration', {
        advisorWeight: parseFloat(advisorPct) / 100,
        committeeWeight: parseFloat(committeePct) / 100,
      });
      setFeedback({ type: 'success', message: 'Weight configuration saved.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Failed to save configuration.' });
    } finally {
      setIsSaving(false);
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
        <Link className="back-link" to="/coordinator">← Back to Coordinator Home</Link>
      </div>

      <div className="hero">
        <p className="eyebrow">Grading</p>
        <h1>Final Evaluation Weights</h1>
        <p className="subtitle">
          Set how much the advisor grade and committee grade each contribute to the team scalar.
          The two values must sum to 100%.
        </p>
      </div>

      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Advisor Weight (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={advisorPct}
              onChange={(e) => setAdvisorPct(e.target.value)}
              disabled={isSaving}
              required
            />
          </label>

          <label className="field">
            <span>Committee Weight (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={committeePct}
              onChange={(e) => setCommitteePct(e.target.value)}
              disabled={isSaving}
              required
            />
          </label>

          <div className={`feedback ${sumOk ? 'feedback-idle' : 'feedback-warning'}`} style={{ padding: '12px 16px' }}>
            <span>Sum: <strong>{sum.toFixed(0)}%</strong>{sumOk ? ' ✓' : ' — must equal 100%'}</span>
          </div>

          {feedback && (
            <div className={`feedback feedback-${feedback.type}`} aria-live="polite">
              <p>{feedback.message}</p>
            </div>
          )}

          <button type="submit" disabled={isSaving || !sumOk}>
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>
      </div>
    </div>
  );
}
