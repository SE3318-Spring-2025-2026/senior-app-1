import React, { useEffect, useState } from 'react';
import { getSprintEvaluation } from '../services/sprintEvaluation';

function SprintEvaluationHistory({ teamId, sprintId }) {
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSprintEvaluation(teamId, sprintId)
      .then(res => {
        setEvaluation(res.data);
        setLoading(false);
      })
      .catch(err => {
        if (err.response?.status === 404) {
          setEvaluation(null);
        } else {
          setError(err.mappedError?.title || 'Error loading evaluation');
        }
        setLoading(false);
      });
  }, [teamId, sprintId]);

  if (loading) return <div>Loading evaluation...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!evaluation) return <div>No evaluation result found for this sprint.</div>;

  const {
    status,
    aggregatedScore,
    completionRate,
    gradingSummary,
    createdBy,
    createdAt
  } = evaluation;

  return (
    <div className="sprint-evaluation-history">
      <h3>Sprint Evaluation Result</h3>
      <div>Status: <b>{status}</b></div>
      {status === 'FAILED' ? (
        <div style={{ color: 'red' }}>
          Evaluation failed.
          {gradingSummary && (
            <div>Reason: {typeof gradingSummary === 'string' ? gradingSummary : JSON.stringify(gradingSummary)}</div>
          )}
        </div>
      ) : (
        <>
          <div>Aggregated Score: {aggregatedScore}</div>
          <div>Completion Rate: {completionRate}</div>
          <div>Grading Summary: {typeof gradingSummary === 'string' ? gradingSummary : JSON.stringify(gradingSummary)}</div>
        </>
      )}
      <div>Created By: {createdBy}</div>
      <div>Created At: {new Date(createdAt).toLocaleString()}</div>
    </div>
  );
}

export default SprintEvaluationHistory;
