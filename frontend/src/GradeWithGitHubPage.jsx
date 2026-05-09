import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import apiClient from './services/apiClient';

/**
 * Dedicated page (typically opened in a new tab from the committee grading
 * page) for grading a single GITHUB_LLM rubric criterion. Shows the team's
 * raw GitHub data — PRs and AI implementation-validation rows — so the
 * professor can either:
 *   (a) read the evidence and enter a manual percentage, or
 *   (b) click "Run AI grading" to get the local LLM's suggestion and
 *       optionally accept it.
 * Either way, clicking "Save score" persists the criterion via the same
 * `/v1/committee/submissions/:submissionId/grade` endpoint that the per-
 * criterion grading page uses, so the score merges into the existing review.
 *
 * URL: /professors/grade-with-github?team=…&sprint=…&submission=…&criterion=…&maxPoints=…&question=…
 */
export default function GradeWithGitHubPage() {
  const [params] = useSearchParams();
  const teamId = params.get('team') || 'team-demo-001';
  const sprintId = params.get('sprint') || 'sprint-2026-05';
  const submissionId = params.get('submission') || '';
  const criterionId = params.get('criterion') || '';
  const maxPoints = Number(params.get('maxPoints') || 100);
  const question = params.get('question') || 'Did the team\'s GitHub work meet expectations?';

  const [prs, setPrs] = useState([]);
  const [validations, setValidations] = useState([]);
  const [percent, setPercent] = useState(0);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [prsRes, valsRes] = await Promise.all([
          apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/pr-review-verifications`),
          apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/ai-validations`),
        ]);
        setPrs(prsRes.data?.data?.pullRequests || []);
        setValidations(valsRes.data?.data?.validations || []);
      } catch (err) {
        setFeedback({ status: 'error', title: 'Load failed', result: err.response?.data?.message || err.message });
      } finally {
        setLoading(false);
      }
    }
    if (teamId && sprintId) load();
  }, [teamId, sprintId]);

  const earnedPoints = useMemo(() => ((percent || 0) / 100) * maxPoints, [percent, maxPoints]);

  async function handleAi() {
    setAiBusy(true);
    setFeedback(null);
    try {
      const res = await apiClient.post(
        `/v1/teams/${teamId}/sprints/${sprintId}/grade-criterion-with-ai`,
        { criterion: { question, maxPoints } },
      );
      const data = res.data?.data || res.data || {};
      setAiSuggestion(data);
      setPercent(Math.round(Number(data.percent) || 0));
      setFeedback({ status: 'success', title: 'AI suggestion ready', result: `Pre-filled ${Math.round(data.percent || 0)}%. Review evidence below, adjust if needed, then Save.` });
    } catch (err) {
      setFeedback({ status: 'error', title: 'AI grading failed', result: err.response?.data?.message || err.message });
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSave() {
    if (!submissionId || !criterionId) {
      setFeedback({ status: 'error', title: 'Cannot save', result: 'Submission or criterion is missing in the URL.' });
      return;
    }
    setSaveBusy(true);
    setFeedback(null);
    try {
      const value = Number(((percent / 100) * maxPoints).toFixed(2));
      const res = await apiClient.post(`/v1/committee/submissions/${submissionId}/grade`, {
        scores: [{ criterionId, value }],
      });
      const fs = res.data?.finalScore ?? res.data?.data?.finalScore;
      setFeedback({
        status: 'success',
        title: 'Saved',
        result: `${percent}% saved (${value} / ${maxPoints} pts). Final review score: ${fs != null ? Number(fs).toFixed(1) : '—'}. You can close this tab.`,
      });
    } catch (err) {
      setFeedback({ status: 'error', title: 'Save failed', result: err.response?.data?.message || err.message });
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <main className="page page-group-view">
      <section className="hero">
        <p className="eyebrow">GitHub-AI grading · Team {teamId} · Sprint {sprintId}</p>
        <h1>Grade: {question}</h1>
        <p className="subtitle">
          Inspect the team's GitHub work below — every PR and every AI-validation row that
          would also be sent to the local LLM if you click <em>Run AI grading</em>. You can
          score manually or use the AI suggestion as a starting point.
        </p>
      </section>

      {feedback && (
        <div className={`feedback feedback-${feedback.status}`} aria-live="polite" style={{ marginBottom: 12 }}>
          <div className="feedback-label">{feedback.status}</div>
          {feedback.title && <h2 style={{ marginTop: 0 }}>{feedback.title}</h2>}
          <p>{feedback.result}</p>
        </div>
      )}

      <section className="group-details-card">
        <h3 style={{ marginTop: 0 }}>Pull requests for this sprint ({prs.length})</h3>
        {loading ? (
          <p>Loading…</p>
        ) : prs.length === 0 ? (
          <p>No pull requests have been synced for this team / sprint.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: 6 }}>PR #</th>
                <th style={{ padding: 6 }}>Issue</th>
                <th style={{ padding: 6 }}>Title</th>
                <th style={{ padding: 6 }}>Review</th>
                <th style={{ padding: 6 }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {prs.map((pr) => (
                <tr key={pr.prNumber} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: 6 }}>{pr.prNumber}</td>
                  <td style={{ padding: 6 }}>{pr.issueKey || '—'}</td>
                  <td style={{ padding: 6 }}>{pr.title || '—'}</td>
                  <td style={{ padding: 6 }}>
                    <strong style={{ color: pr.reviewVerified === 'REVIEWED' ? '#1f9e4a' : pr.reviewVerified === 'NOT_REVIEWED' ? '#c92a2a' : '#888' }}>
                      {pr.reviewVerified}
                    </strong>
                    {pr.reviewReasoning && <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{pr.reviewReasoning}</div>}
                  </td>
                  <td style={{ padding: 6 }}>{pr.reviewConfidence != null ? Number(pr.reviewConfidence).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="group-details-card">
        <h3 style={{ marginTop: 0 }}>AI implementation validations ({validations.length})</h3>
        {loading ? (
          <p>Loading…</p>
        ) : validations.length === 0 ? (
          <p>No AI validations recorded for this team / sprint.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: 6 }}>Issue</th>
                <th style={{ padding: 6 }}>Status</th>
                <th style={{ padding: 6 }}>Confidence</th>
                <th style={{ padding: 6 }}>Feedback</th>
              </tr>
            </thead>
            <tbody>
              {validations.map((v) => (
                <tr key={v.validationId || v.issueKey}>
                  <td style={{ padding: 6 }}>{v.issueKey}</td>
                  <td style={{ padding: 6 }}>
                    <strong style={{ color: v.validationStatus === 'MATCHED' ? '#1f9e4a' : v.validationStatus === 'PARTIAL_MATCH' ? '#d9822b' : '#c92a2a' }}>
                      {v.validationStatus}
                    </strong>
                  </td>
                  <td style={{ padding: 6 }}>{v.confidence != null ? Number(v.confidence).toFixed(2) : '—'}</td>
                  <td style={{ padding: 6 }}>{v.feedback || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="group-details-card">
        <h3 style={{ marginTop: 0 }}>Your score</h3>
        <p style={{ margin: '0 0 8px' }}>
          Adjust the slider or type a percentage. The earned points (out of <strong>{maxPoints}</strong>) update live.
        </p>

        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <input
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => {
              const raw = parseFloat(e.target.value);
              setPercent(Number.isNaN(raw) ? 0 : Math.min(100, Math.max(0, raw)));
            }}
            style={{ width: 90 }}
          />
          <span>%</span>
          <span style={{ marginLeft: 'auto' }}>
            = <strong>{earnedPoints.toFixed(2)}</strong> / {maxPoints} pts
          </span>
        </div>

        {aiSuggestion && (
          <div style={{ marginTop: 10, padding: 10, background: 'rgba(56,195,204,0.1)', borderRadius: 4, fontSize: '0.88rem' }}>
            🤖 AI says <strong>{aiSuggestion.percent}%</strong>{aiSuggestion.status ? ` (${aiSuggestion.status})` : ''}
            {aiSuggestion.feedback ? ` — ${aiSuggestion.feedback}` : ''}
            {aiSuggestion.explain?.elapsedMs != null && (
              <span style={{ marginLeft: 8, color: 'var(--muted)' }}>· {aiSuggestion.explain.elapsedMs} ms · {aiSuggestion.explain.model}</span>
            )}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleAi} disabled={aiBusy || saveBusy} style={{ background: 'var(--accent-strong)', color: 'white' }}>
            {aiBusy ? 'Asking AI…' : '🤖 Run AI grading'}
          </button>
          <button type="button" onClick={handleSave} disabled={saveBusy || aiBusy || !submissionId || !criterionId}>
            {saveBusy ? 'Saving…' : 'Save score'}
          </button>
          <button type="button" onClick={() => window.close()}>Close tab</button>
        </div>
        {(!submissionId || !criterionId) && (
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 8 }}>
            Save is disabled because the URL is missing <code>submission</code> or <code>criterion</code>. Open this page from the
            grading screen's <em>Grade with AI →</em> link, or add the params manually.
          </p>
        )}
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/professors/committee-submissions">← Back to Grade Submissions</Link>
      </p>
    </main>
  );
}
