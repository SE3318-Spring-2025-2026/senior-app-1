import React, { useState } from 'react';
import { triggerSprintEvaluation, getSprintEvaluation } from '../services/sprintEvaluation';

function SprintEvaluationTrigger({ teamId, sprintId, userId, onTriggered }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [polling, setPolling] = useState(false);

  async function handleTrigger() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await triggerSprintEvaluation(teamId, sprintId, userId);
      setResult(data);
      setLoading(false);
      setPolling(true);
      pollStatus();
      if (onTriggered) onTriggered(data);
    } catch (err) {
      setError(err.mappedError?.title || err.message || 'Failed to trigger evaluation');
      setLoading(false);
    }
  }

  async function pollStatus() {
    let attempts = 0;
    const maxAttempts = 10;
    const interval = 2000;
    async function poll() {
      try {
        const { data } = await getSprintEvaluation(teamId, sprintId);
        setResult(data);
        if (data.status === 'IN_PROGRESS' && attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, interval);
        } else {
          setPolling(false);
        }
      } catch (err) {
        setError('Failed to fetch evaluation status');
        setPolling(false);
      }
    }
    poll();
  }

  return (
    <div className="sprint-evaluation-trigger">
      <button onClick={handleTrigger} disabled={loading || polling}>
        {loading || polling ? 'Running Evaluation...' : 'Run Evaluation'}
      </button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {result && (
        <div className="evaluation-result">
          <div>Evaluation ID: {result.evaluationId}</div>
          <div>Status: {result.status}</div>
          <div>Created At: {new Date(result.createdAt).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}

export default SprintEvaluationTrigger;
