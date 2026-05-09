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

function badge(text, color) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        background: color,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 600,
        marginRight: 6,
      }}
    >
      {text}
    </span>
  );
}

function PullRequestCard({ pr, stories }) {
  const linkedStory = stories.find((s) => s.issueKey === pr.issueKey);
  const summary = pr.diffSummary && typeof pr.diffSummary === 'object' ? pr.diffSummary : null;
  const body = summary?.body || (typeof pr.diffSummary === 'string' ? pr.diffSummary : '');
  const files = pr.changedFiles || [];

  const mergeColor = /merged/i.test(String(pr.mergeStatus || pr.prStatus || '')) ? '#1f9e4a'
    : /open|mergeable/i.test(String(pr.mergeStatus || pr.prStatus || '')) ? '#3a7bd5'
    : '#c92a2a';
  const reviewColor = pr.reviewVerified === 'REVIEWED' ? '#1f9e4a'
    : pr.reviewVerified === 'NOT_REVIEWED' ? '#c92a2a'
    : '#888';

  return (
    <article style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <strong style={{ fontSize: '1rem' }}>PR #{pr.prNumber}</strong>
        <span style={{ fontSize: '0.95rem' }}>{pr.title}</span>
        {pr.url ? (
          <a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', marginLeft: 'auto' }}>
            Open on GitHub ↗
          </a>
        ) : null}
      </header>

      <div style={{ marginBottom: 6 }}>
        {badge(String(pr.mergeStatus || pr.prStatus || 'UNKNOWN'), mergeColor)}
        {badge(`Review: ${pr.reviewVerified || 'PENDING'}`, reviewColor)}
        {pr.issueKey && badge(`Issue #${pr.issueKey}`, '#3a7bd5')}
        {pr.branchName && (
          <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--muted)' }}>{pr.branchName}</span>
        )}
      </div>

      {summary?.author && (
        <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: 'var(--muted)' }}>
          author: {summary.author}
          {summary.createdAt ? ` · created ${new Date(summary.createdAt).toLocaleDateString()}` : ''}
          {summary.mergedAt ? ` · merged ${new Date(summary.mergedAt).toLocaleDateString()}` : ''}
        </p>
      )}

      {pr.reviewReasoning && (
        <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: 'var(--muted)' }}>
          AI review reasoning: {pr.reviewReasoning}
        </p>
      )}

      {body && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>PR description</summary>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.18)', padding: 8, borderRadius: 4, marginTop: 4, fontSize: '0.82rem' }}>
            {body}
          </pre>
        </details>
      )}

      {files.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Changed files ({files.length})</summary>
          <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: '0.82rem', fontFamily: 'monospace' }}>
            {files.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </details>
      )}

      {summary?.changedLineSample && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Diff snippet</summary>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.18)', padding: 8, borderRadius: 4, marginTop: 4, fontSize: '0.78rem', fontFamily: 'monospace' }}>
            {summary.changedLineSample}
          </pre>
        </details>
      )}

      {linkedStory && (
        <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
          linked story: {linkedStory.title}
        </p>
      )}
    </article>
  );
}

function StoryCard({ story, prs }) {
  return (
    <article style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <strong style={{ fontFamily: 'monospace' }}>#{story.issueKey}</strong>
        <span style={{ fontSize: '0.95rem' }}>{story.title}</span>
        <span style={{ marginLeft: 'auto' }}>
          {badge(story.status || 'UNKNOWN',
            story.status === 'DONE' ? '#1f9e4a'
            : /progress/i.test(String(story.status || '')) ? '#d9822b'
            : '#888')}
          {story.storyPoints != null && badge(`${story.storyPoints} pts`, '#3a7bd5')}
        </span>
      </header>

      {story.description && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Issue description</summary>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.18)', padding: 8, borderRadius: 4, marginTop: 4, fontSize: '0.82rem' }}>
            {story.description}
          </pre>
        </details>
      )}

      {prs.length > 0 ? (
        <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
          linked PRs: {prs.map((p) => `#${p.prNumber}`).join(', ')}
        </p>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#c92a2a' }}>
          ⚠ no PR linked to this issue yet
        </p>
      )}
    </article>
  );
}
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
  const [stories, setStories] = useState([]);
  const [percent, setPercent] = useState(0);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Validate the submission UUID in the URL still exists. If a previous
        // `--reset` regenerated UUIDs the URL is stale → look up the current
        // pending submission and tell the user to open it instead.
        const pendingRes = await apiClient.get('/v1/committee/submissions/pending').catch(() => null);
        const pending = pendingRes?.data?.submissions || [];
        const exists = submissionId && pending.some((s) => s.id === submissionId);
        if (submissionId && !exists && pending.length > 0) {
          // Try, in order: same team, then same team+type, then anything.
          const sameTeam = pending.filter((s) => s.groupId === teamId);
          const replacement = sameTeam[0] || pending[0];
          const buildUrl = (sub) => `${window.location.pathname}?` + new URLSearchParams({
            ...Object.fromEntries(params.entries()),
            submission: sub.id,
          }).toString();
          setFeedback({
            status: 'error',
            title: 'Submission not found in DB',
            result: `The submission UUID ${submissionId.slice(0, 8)}… in this URL doesn't exist anymore (the database was reset). Pick a current submission below.`,
            replacementUrl: buildUrl(replacement),
            replacementGroup: replacement?.group?.name,
            replacementType: replacement?.type,
            allReplacements: pending.map((s) => ({
              id: s.id,
              type: s.type,
              groupName: s.group?.name,
              groupId: s.groupId,
              url: buildUrl(s),
              isSameTeam: s.groupId === teamId,
            })),
          });
        }

        const [prsRes, valsRes, storiesRes] = await Promise.all([
          apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/pr-review-verifications`).catch((e) => { console.warn('pr-review fetch failed', e); return null; }),
          apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/ai-validations`).catch((e) => { console.warn('ai-validations fetch failed', e); return null; }),
          apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/stories`).catch((e) => { console.warn('stories fetch failed', e); return null; }),
        ]);
        setPrs(prsRes?.data?.data?.pullRequests || []);
        setValidations(valsRes?.data?.data?.validations || []);
        setStories(storiesRes?.data?.data?.stories || []);
      } finally {
        setLoading(false);
      }
    }
    if (teamId && sprintId) load();
  }, [teamId, sprintId]);

  // Build the integrity matrix: for each story, find the PR(s) that claim
  // to implement it (via SprintStory.linkedPullRequests OR PR.issueKey),
  // and the AI implementation-validation verdict for the same issue key.
  const integrity = useMemo(() => {
    const prByIssue = new Map();
    for (const pr of prs) {
      const k = pr.issueKey;
      if (!k) continue;
      const arr = prByIssue.get(k) || [];
      arr.push(pr);
      prByIssue.set(k, arr);
    }
    const valByIssue = new Map();
    for (const v of validations) {
      valByIssue.set(v.issueKey, v);
    }

    const rows = stories.map((story) => {
      const linked = prByIssue.get(story.issueKey) || [];
      const validation = valByIssue.get(story.issueKey) || null;
      const hasPr = linked.length > 0;
      const allMerged = hasPr && linked.every((p) => /merged/i.test(String(p.mergeStatus || '')) || /merged/i.test(String(p.prStatus || '')));
      const reviewed = linked.some((p) => p.reviewVerified === 'REVIEWED');
      const validationOk = validation && validation.validationStatus === 'MATCHED';
      const partial = validation && validation.validationStatus === 'PARTIAL_MATCH';

      let verdict = 'OK';
      const issues = [];
      if (!hasPr) { verdict = 'MISSING'; issues.push('no PR linked'); }
      if (hasPr && !allMerged) { verdict = 'OPEN'; issues.push('PR not merged'); }
      if (hasPr && !reviewed) { issues.push('no review'); if (verdict === 'OK') verdict = 'WARN'; }
      if (validation && !validationOk) { issues.push(partial ? 'AI: partial match' : `AI: ${validation.validationStatus}`); if (verdict === 'OK') verdict = 'WARN'; }
      if (!validation) { issues.push('no AI validation'); if (verdict === 'OK') verdict = 'WARN'; }
      if (!hasPr && !validation) verdict = 'MISSING';

      return {
        story,
        linked,
        validation,
        verdict,
        notes: issues,
      };
    });

    // Also surface PRs that don't link to any story (orphan PRs)
    const storyKeys = new Set(stories.map((s) => s.issueKey));
    const orphans = prs.filter((pr) => pr.issueKey && !storyKeys.has(pr.issueKey));

    return { rows, orphans };
  }, [stories, prs, validations]);

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

      // Tell every other tab on this submission to re-fetch its review state.
      // The committee grading page (the "parent") listens to the `storage`
      // event and to postMessage and refreshes its scores immediately, so
      // the saved value shows up there without a manual reload.
      const payload = {
        submissionId,
        criterionId,
        percent,
        value,
        finalScore: fs,
        savedAt: new Date().toISOString(),
      };
      try {
        const key = `committee-grade-saved:${submissionId}`;
        window.localStorage.setItem(key, JSON.stringify(payload));
        window.localStorage.removeItem(key);
      } catch (_) { /* localStorage unavailable */ }
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'COMMITTEE_GRADE_SAVED', payload }, window.location.origin);
        }
      } catch (_) { /* opener gone */ }

      setFeedback({
        status: 'success',
        title: 'Saved',
        result: `${percent}% saved (${value} / ${maxPoints} pts). Final review score: ${fs != null ? Number(fs).toFixed(1) : '—'}. The grading page in the other tab has been notified — close this tab when you're done.`,
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
          {feedback.allReplacements && feedback.allReplacements.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {feedback.allReplacements.map((r) => (
                <li key={r.id} style={{ marginBottom: 4 }}>
                  <a href={r.url} style={{ color: r.isSameTeam ? '#3a7bd5' : 'var(--muted)', fontWeight: r.isSameTeam ? 600 : 400 }}>
                    {r.groupName || r.groupId} · {r.type}
                  </a>
                  {r.isSameTeam ? ' ← same team as this URL' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="group-details-card">
        <h3 style={{ marginTop: 0 }}>Issue ↔ PR ↔ AI integrity ({integrity.rows.length} stories)</h3>
        {integrity.rows.length === 0 ? (
          <p>No JIRA stories synced for this sprint yet — run the sprint sync or wait for the daily refresh.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: 6 }}>Issue</th>
                <th style={{ padding: 6 }}>Story title / status</th>
                <th style={{ padding: 6 }}>PRs</th>
                <th style={{ padding: 6 }}>Reviewed?</th>
                <th style={{ padding: 6 }}>AI verdict</th>
                <th style={{ padding: 6 }}>Integrity</th>
              </tr>
            </thead>
            <tbody>
              {integrity.rows.map((row) => {
                const verdictColor = row.verdict === 'OK' ? '#1f9e4a' : row.verdict === 'WARN' ? '#d9822b' : '#c92a2a';
                return (
                  <tr key={row.story.issueKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: 6, fontFamily: 'monospace' }}>{row.story.issueKey}</td>
                    <td style={{ padding: 6 }}>
                      <div>{row.story.title}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                        {row.story.status} · {row.story.storyPoints != null ? `${row.story.storyPoints} pts` : 'no points'}
                      </div>
                    </td>
                    <td style={{ padding: 6 }}>
                      {row.linked.length === 0 ? (
                        <span style={{ color: '#c92a2a' }}>— none —</span>
                      ) : (
                        row.linked.map((pr) => (
                          <div key={pr.prNumber}>#{pr.prNumber} {pr.title} <span style={{ color: 'var(--muted)' }}>({pr.mergeStatus || pr.prStatus})</span></div>
                        ))
                      )}
                    </td>
                    <td style={{ padding: 6 }}>
                      {row.linked.length === 0 ? '—' : row.linked.map((pr) => (
                        <div key={pr.prNumber}>
                          <strong style={{ color: pr.reviewVerified === 'REVIEWED' ? '#1f9e4a' : pr.reviewVerified === 'NOT_REVIEWED' ? '#c92a2a' : '#888' }}>
                            {pr.reviewVerified || 'PENDING'}
                          </strong>
                          {pr.reviewConfidence != null ? ` (${Number(pr.reviewConfidence).toFixed(2)})` : ''}
                        </div>
                      ))}
                    </td>
                    <td style={{ padding: 6 }}>
                      {row.validation ? (
                        <>
                          <strong style={{ color: row.validation.validationStatus === 'MATCHED' ? '#1f9e4a' : row.validation.validationStatus === 'PARTIAL_MATCH' ? '#d9822b' : '#c92a2a' }}>
                            {row.validation.validationStatus}
                          </strong>
                          <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>conf {Number(row.validation.confidence ?? 0).toFixed(2)}</div>
                        </>
                      ) : (
                        <span style={{ color: '#888' }}>— none —</span>
                      )}
                    </td>
                    <td style={{ padding: 6 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: verdictColor,
                        color: 'white',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}>
                        {row.verdict}
                      </span>
                      {row.notes.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
                          {row.notes.join('; ')}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {integrity.orphans.length > 0 && (
          <div style={{ marginTop: 12, padding: 8, background: 'rgba(217,130,43,0.1)', borderRadius: 4, fontSize: '0.85rem' }}>
            <strong>⚠ Orphan PRs:</strong> {integrity.orphans.length} PR{integrity.orphans.length === 1 ? '' : 's'} reference an issue key that has no JIRA story
            ({integrity.orphans.map((pr) => `#${pr.prNumber}→${pr.issueKey}`).join(', ')}).
          </div>
        )}
      </section>

      <section className="group-details-card">
        <h3 style={{ marginTop: 0 }}>Pull requests for this sprint ({prs.length})</h3>
        {loading ? (
          <p>Loading…</p>
        ) : prs.length === 0 ? (
          <p>No pull requests have been synced for this team / sprint.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {prs.map((pr) => (
              <PullRequestCard key={pr.prNumber} pr={pr} stories={stories} />
            ))}
          </div>
        )}
      </section>

      <section className="group-details-card">
        <h3 style={{ marginTop: 0 }}>JIRA stories ({stories.length})</h3>
        {loading ? (
          <p>Loading…</p>
        ) : stories.length === 0 ? (
          <p>No stories synced.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {stories.map((s) => (
              <StoryCard key={s.issueKey} story={s} prs={prs.filter((p) => p.issueKey === s.issueKey)} />
            ))}
          </div>
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
