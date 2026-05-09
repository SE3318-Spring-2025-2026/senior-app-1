import React, { useEffect, useMemo, useState } from 'react';
import {
  triggerPrReviewVerification,
  listPrReviewStatuses,
  runAiValidation,
  listAiValidations,
  getAiSignals,
} from '../services/aiFeatures';
import apiClient from '../services/apiClient';

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
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [validationForm, setValidationForm] = useState({
    issueKey: '',
    issueDescription: '',
    fileDiffsRaw: '',
    prNumber: '',
  });

  async function refresh() {
    setError(null);
    try {
      const [reviewsRes, validationsRes, signalsRes, storiesRes] = await Promise.all([
        listPrReviewStatuses(teamId, sprintId).catch(() => ({ data: { data: { pullRequests: [] } } })),
        listAiValidations(teamId, sprintId).catch(() => ({ data: { data: { validations: [] } } })),
        getAiSignals(teamId, sprintId).catch(() => ({ data: { data: null } })),
        apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/stories`).catch(() => ({ data: { data: { stories: [] } } })),
      ]);
      const prData = reviewsRes.data?.data;
      setReviews(prData?.pullRequests || []);
      if (typeof prData?.aiAvailable === 'boolean') setAiAvailable(prData.aiAvailable);
      setValidations(validationsRes.data?.data?.validations || []);
      setSignals(signalsRes.data?.data || null);
      setStories(storiesRes.data?.data?.stories || []);
    } catch (err) {
      setError(err.message || 'Failed to load AI feature data');
    }
  }

  // Build a quick lookup so picking a story auto-fills the form with its
  // description and the file-diff summary of the PR(s) that claim it.
  const issueOptions = useMemo(() => {
    const prsByIssue = new Map();
    for (const pr of reviews) {
      const k = pr.issueKey;
      if (!k) continue;
      const arr = prsByIssue.get(k) || [];
      arr.push(pr);
      prsByIssue.set(k, arr);
    }
    return stories.map((s) => ({
      issueKey: s.issueKey,
      title: s.title,
      description: s.description || '',
      linkedPrs: prsByIssue.get(s.issueKey) || [],
    }));
  }, [stories, reviews]);

  function autoFillFromIssue(issueKey) {
    if (!issueKey) {
      setValidationForm({ issueKey: '', issueDescription: '', fileDiffsRaw: '', prNumber: '' });
      return;
    }
    const opt = issueOptions.find((o) => o.issueKey === issueKey);
    if (!opt) return;
    const firstPr = opt.linkedPrs[0];
    // Build "path::diff" lines from the PR's changed files (using the diff
    // summary as the diff text since we don't have full patches stored).
    const summary = firstPr?.diffSummary && typeof firstPr.diffSummary === 'object' ? firstPr.diffSummary : null;
    const summaryText = summary?.body || (typeof firstPr?.diffSummary === 'string' ? firstPr.diffSummary : firstPr?.title || '');
    const lines = (firstPr?.changedFiles || []).map((p) => `${p}::${summaryText.slice(0, 200)}`);
    setValidationForm({
      issueKey: opt.issueKey,
      issueDescription: opt.title + (opt.description ? `\n\n${opt.description}` : ''),
      fileDiffsRaw: lines.join('\n'),
      prNumber: firstPr ? String(firstPr.prNumber) : '',
    });
  }

  async function validateAllIssues() {
    setBulkBusy(true);
    setError(null);
    try {
      for (const opt of issueOptions) {
        const firstPr = opt.linkedPrs[0];
        const summary = firstPr?.diffSummary && typeof firstPr.diffSummary === 'object' ? firstPr.diffSummary : null;
        const summaryText = summary?.body || (typeof firstPr?.diffSummary === 'string' ? firstPr.diffSummary : firstPr?.title || 'no diff available');
        const fileDiffs = (firstPr?.changedFiles || []).map((p) => ({ path: p, diff: summaryText.slice(0, 1000) }));
        if (fileDiffs.length === 0) {
          fileDiffs.push({ path: 'no-files', diff: opt.title });
        }
        await runAiValidation(teamId, sprintId, {
          issueKey: opt.issueKey,
          issueDescription: opt.title + (opt.description ? `\n\n${opt.description}` : ''),
          fileDiffs,
          prNumber: firstPr ? Number(firstPr.prNumber) : undefined,
        }).catch((err) => console.warn(`validate ${opt.issueKey} failed`, err));
      }
      await refresh();
    } finally {
      setBulkBusy(false);
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
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0 }}>
          One click runs AI validation for every seeded issue using its description + the linked PR's diff summary.
          Per-criterion rubric grading uses the same data — see the GITHUB_LLM criterion in the committee grading page.
        </p>
        <button onClick={validateAllIssues} disabled={bulkBusy || issueOptions.length === 0}>
          {bulkBusy ? `Validating ${issueOptions.length} issues…` : `🤖 Validate all ${issueOptions.length} issues`}
        </button>

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
