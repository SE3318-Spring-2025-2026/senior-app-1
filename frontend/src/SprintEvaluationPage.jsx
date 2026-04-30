import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import apiClient from './services/apiClient';

const initialForm = {
  sprintId: '',
  aggregatedScore: '',
  completionRate: '',
  gradingSummary: '',
};

export default function SprintEvaluationPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [result, setResult] = useState(null);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setValidationError('');
    setRequestError('');
    setResult(null);

    if (!form.sprintId.trim() || form.aggregatedScore === '' || form.completionRate === '') {
      setValidationError('Sprint ID, aggregated score, and completion rate are required.');
      return;
    }

    setSubmitting(true);

    try {
      const { data } = await apiClient.post(
        `/v1/teams/${teamId}/sprints/${form.sprintId.trim()}/evaluations`,
        {
          aggregatedScore: Number(form.aggregatedScore),
          completionRate: Number(form.completionRate),
          createdBy: String(user?.id || ''),
          gradingSummary: form.gradingSummary.trim(),
        },
      );

      setResult({
        ...data,
        aggregatedScore: Number(form.aggregatedScore),
        completionRate: Number(form.completionRate),
        gradingSummary: form.gradingSummary.trim(),
      });
      setForm(initialForm);
    } catch (error) {
      setRequestError(error.response?.data?.message || error.message || 'Failed to create sprint evaluation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page page-group-view">
      <section className="hero group-page-header">
        <p className="eyebrow">Sprint Monitoring</p>
        <h1>Create Sprint Evaluation</h1>
        <p className="group-page-status">Team {teamId}</p>
      </section>

      <section className="group-details-card">
        <form className="form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Sprint ID</span>
            <input
              type="text"
              value={form.sprintId}
              onChange={(event) => updateField('sprintId', event.target.value)}
              placeholder="e.g. sprint-2026-03"
            />
          </label>

          <label className="field">
            <span>Aggregated Score</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.aggregatedScore}
              onChange={(event) => updateField('aggregatedScore', event.target.value)}
              placeholder="e.g. 86.2"
            />
          </label>

          <label className="field">
            <span>Completion Rate</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.completionRate}
              onChange={(event) => updateField('completionRate', event.target.value)}
              placeholder="e.g. 0.84"
            />
          </label>

          <label className="field">
            <span>Grading Summary</span>
            <textarea
              value={form.gradingSummary}
              onChange={(event) => updateField('gradingSummary', event.target.value)}
              rows={5}
              placeholder="Optional summary for the sprint evaluation"
            />
          </label>

          <div className="invite-form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating Evaluation...' : 'Create Evaluation'}
            </button>
          </div>
        </form>

        {validationError && (
          <div className="feedback feedback-warning" aria-live="polite">
            <div className="feedback-label">validation</div>
            <h2>Required information missing</h2>
            <p>{validationError}</p>
          </div>
        )}

        {requestError && (
          <div className="feedback feedback-error" aria-live="polite">
            <div className="feedback-label">error</div>
            <h2>Evaluation could not be created</h2>
            <p>{requestError}</p>
          </div>
        )}

        {result && (
          <div className="feedback feedback-success" aria-live="polite">
            <div className="feedback-label">success</div>
            <h2>Sprint evaluation created</h2>
            <p>Evaluation {result.evaluationId} was stored successfully for {result.sprintId}.</p>
            <div className="group-summary-grid">
              <div className="group-summary-item">
                <span>Status</span>
                <strong>{result.status}</strong>
              </div>
              <div className="group-summary-item">
                <span>Aggregated Score</span>
                <strong>{result.aggregatedScore}</strong>
              </div>
              <div className="group-summary-item">
                <span>Completion Rate</span>
                <strong>{result.completionRate}</strong>
              </div>
              <div className="group-summary-item">
                <span>Created At</span>
                <strong>{new Date(result.createdAt).toLocaleString()}</strong>
              </div>
            </div>
            {result.gradingSummary && <p className="integration-warning-copy">{result.gradingSummary}</p>}
          </div>
        )}
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to={`/students/groups/${teamId}/integrations`}>Back to Integrations</Link>
      </p>
    </main>
  );
}
