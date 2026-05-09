import React, { useEffect, useState } from 'react';
import {
  triggerPrReviewVerification,
  listPrReviewStatuses,
  runAiValidation,
  listAiValidations,
  getAiSignals,
} from '../services/aiFeatures';

function StatusBadge({ status }) {
  const colorMap = {
    REVIEWED: '#1f9e4a',
    NOT_REVIEWED: '#c92a2a',
    MATCHED: '#1f9e4a',
    PARTIAL_MATCH: '#d9822b',
    NOT_MATCHED: '#c92a2a',
    PENDING: '#888',
    AI_UNAVAILABLE: '#888',
    AI_ERROR: '#c92a2a',
    AI_PARSE_ERROR: '#c92a2a',
  };
  return (
    <span
      style={{
        background: colorMap[status] || '#888',
        color: 'white',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      {status || 'UNKNOWN'}
    </span>
  );
}

export default function AiFeaturesPanel({ teamId, sprintId }) {
  const [reviews, setReviews] = useState([]);
  const [validations, setValidations] = useState([]);
  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiAvailable, setAiAvailable] = useState(true);

  const [validationForm, setValidationForm] = useState({
    issueKey: '',
    issueDescription: '',
    fileDiffsRaw: '',
    prNumber: '',
  });

  async function refresh() {
    setError(null);
    try {
      const [reviewsRes, validationsRes, signalsRes] = await Promise.all([
        listPrReviewStatuses(teamId, sprintId).catch(() => ({ data: { data: { pullRequests: [] } } })),
        listAiValidations(teamId, sprintId).catch(() => ({ data: { data: { validations: [] } } })),
        getAiSignals(teamId, sprintId).catch(() => ({ data: { data: null } })),
      ]);
      const prData = reviewsRes.data?.data;
      setReviews(prData?.pullRequests || []);
      if (typeof prData?.aiAvailable === 'boolean') setAiAvailable(prData.aiAvailable);
      setValidations(validationsRes.data?.data?.validations || []);
      setSignals(signalsRes.data?.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load AI feature data');
    }
  }

  useEffect(() => {
    if (teamId && sprintId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, sprintId]);

  async function handleVerifyReviews() {
    setLoading(true);
    setError(null);
    try {
      await triggerPrReviewVerification(teamId, sprintId);
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to verify PR reviews');
    } finally {
      setLoading(false);
    }
  }

  async function handleRunValidation(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fileDiffs = parseFileDiffs(validationForm.fileDiffsRaw);
      if (!fileDiffs.length) {
        throw new Error('Provide at least one file diff: each line starts with "path::diff"');
      }
      await runAiValidation(teamId, sprintId, {
        issueKey: validationForm.issueKey,
        issueDescription: validationForm.issueDescription,
        fileDiffs,
        prNumber: validationForm.prNumber ? Number(validationForm.prNumber) : undefined,
      });
      setValidationForm({ issueKey: '', issueDescription: '', fileDiffsRaw: '', prNumber: '' });
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to run AI validation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ai-features-panel" style={{ marginTop: 24 }}>
      <h2>AI Sprint Insights</h2>
      {!aiAvailable && (
        <p style={{ background: '#fff3cd', padding: 8, borderRadius: 4 }}>
          ⚠️ Anthropic API key is not configured on the backend. AI calls will return AI_UNAVAILABLE
          but stored data is still readable.
        </p>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {signals && (
        <div className="ai-signals-summary" style={{ marginBottom: 16 }}>
          <h3>Aggregated AI signals</h3>
          <ul>
            <li>PRs with verified reviews: {signals.reviewedPullRequestCount} / {signals.pullRequestCount}</li>
            <li>Reviewed ratio: {(signals.reviewedRatio * 100).toFixed(1)}%</li>
            <li>Issues validated: {signals.aiValidationCount}</li>
            <li>Match score: {(signals.matchedRatio * 100).toFixed(1)}%</li>
          </ul>
        </div>
      )}

      <div className="ai-pr-reviews" style={{ marginBottom: 24 }}>
        <h3>PR review verification</h3>
        <button onClick={handleVerifyReviews} disabled={loading}>
          {loading ? 'Verifying…' : 'Run AI review verification'}
        </button>
        {reviews.length === 0 ? (
          <p>No pull requests stored for this sprint yet.</p>
        ) : (
          <table style={{ marginTop: 8, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th align="left">PR #</th>
                <th align="left">Issue</th>
                <th align="left">Title</th>
                <th align="left">Status</th>
                <th align="left">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((row) => (
                <tr key={row.prNumber}>
                  <td>{row.prNumber}</td>
                  <td>{row.issueKey || '—'}</td>
                  <td>{row.title || '—'}</td>
                  <td><StatusBadge status={row.reviewVerified} /></td>
                  <td>{row.reviewConfidence != null ? row.reviewConfidence.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ai-validations" style={{ marginBottom: 24 }}>
        <h3>Issue implementation validation</h3>
        <form onSubmit={handleRunValidation} style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
          <input
            placeholder="Issue key (e.g. SPM-214)"
            value={validationForm.issueKey}
            onChange={(e) => setValidationForm({ ...validationForm, issueKey: e.target.value })}
            required
          />
          <textarea
            placeholder="Issue description"
            value={validationForm.issueDescription}
            onChange={(e) => setValidationForm({ ...validationForm, issueDescription: e.target.value })}
            rows={3}
            required
          />
          <textarea
            placeholder={'File diffs — one per line as "path::diff text"'}
            value={validationForm.fileDiffsRaw}
            onChange={(e) => setValidationForm({ ...validationForm, fileDiffsRaw: e.target.value })}
            rows={5}
            required
          />
          <input
            placeholder="PR number (optional)"
            value={validationForm.prNumber}
            onChange={(e) => setValidationForm({ ...validationForm, prNumber: e.target.value })}
            type="number"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Running AI…' : 'Validate implementation'}
          </button>
        </form>

        {validations.length === 0 ? (
          <p>No AI validations stored yet.</p>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th align="left">Issue</th>
                <th align="left">Status</th>
                <th align="left">Confidence</th>
                <th align="left">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {validations.map((v) => (
                <tr key={v.validationId}>
                  <td>{v.issueKey}</td>
                  <td><StatusBadge status={v.validationStatus} /></td>
                  <td>{v.confidence != null ? v.confidence.toFixed(2) : '—'}</td>
                  <td>{v.feedback || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function parseFileDiffs(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('::');
      if (idx === -1) return null;
      return { path: line.slice(0, idx).trim(), diff: line.slice(idx + 2).trim() };
    })
    .filter(Boolean);
}
