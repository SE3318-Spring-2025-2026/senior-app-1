import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

/**
 * Each rubric criterion is its own card with its own Save button. Saving a
 * criterion immediately POSTs to /grade with just that one criterion's score —
 * the backend merges it into the in-progress review row, so previous criteria
 * stay intact. The grader can save criteria one at a time, in any order.
 *
 * Each criterion is graded as a percentage 0-100. The actual points awarded
 * are (percent / 100) × maxPoints. The page shows both numbers live.
 */
function CriterionCard({ criterion, percent, savedPercent, busy, locked, onChange, onSave, submissionId }) {
  const isBinary = criterion.criterionType === 'BINARY';
  const isGithubLlm = criterion.criterionType === 'GITHUB_LLM';
  const points = ((percent || 0) / 100) * (criterion.maxPoints || 0);
  const weightPct = Math.round((criterion.weight || 0) * 100);
  const dirty = percent !== savedPercent;

  // For GITHUB_LLM criteria we render an inline expandable section with
  // the team's PRs / issues / AI validations + a "Run AI grading" button.
  // Everything happens on this page — no second tab.
  const TEAM_ID = 'team-demo-001';
  const SPRINT_ID = 'sprint-2026-05';
  const [showGitHub, setShowGitHub] = useState(false);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghPrs, setGhPrs] = useState([]);
  const [ghValidations, setGhValidations] = useState([]);
  const [ghStories, setGhStories] = useState([]);
  const [ghError, setGhError] = useState(null);
  const [ghAiBusy, setGhAiBusy] = useState(false);
  const [ghAiSuggestion, setGhAiSuggestion] = useState(null);

  const [ghBulkBusy, setGhBulkBusy] = useState(null); // 'reviews' | 'validations' | null
  const [ghSignals, setGhSignals] = useState(null);

  async function loadGithubData() {
    setGhLoading(true);
    setGhError(null);
    try {
      const [prsRes, valsRes, storiesRes, signalsRes] = await Promise.all([
        apiClient.get(`/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/pr-review-verifications`).catch(() => null),
        apiClient.get(`/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-validations`).catch(() => null),
        apiClient.get(`/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/stories`).catch(() => null),
        apiClient.get(`/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-signals`).catch(() => null),
      ]);
      setGhPrs(prsRes?.data?.data?.pullRequests || []);
      setGhValidations(valsRes?.data?.data?.validations || []);
      setGhStories(storiesRes?.data?.data?.stories || []);
      setGhSignals(signalsRes?.data?.data || null);
    } catch (err) {
      setGhError(err.message || 'Failed to load GitHub data');
    } finally {
      setGhLoading(false);
    }
  }

  async function runBulkPrReviewVerification() {
    setGhBulkBusy('reviews');
    setGhError(null);
    try {
      await apiClient.post(`/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/pr-review-verifications`, {});
      await loadGithubData();
    } catch (err) {
      setGhError(err.response?.data?.message || err.message || 'Bulk PR review verification failed');
    } finally {
      setGhBulkBusy(null);
    }
  }

  async function runBulkIssueValidation() {
    setGhBulkBusy('validations');
    setGhError(null);
    try {
      // For each story, build {issueKey, issueDescription, fileDiffs} from
      // the linked PR's data and POST to /ai-validations one at a time.
      const prsByIssue = new Map();
      for (const pr of ghPrs) {
        const k = pr.issueKey;
        if (!k) continue;
        const arr = prsByIssue.get(k) || [];
        arr.push(pr);
        prsByIssue.set(k, arr);
      }
      for (const story of ghStories) {
        const firstPr = (prsByIssue.get(story.issueKey) || [])[0];
        const summary = firstPr?.diffSummary && typeof firstPr.diffSummary === 'object' ? firstPr.diffSummary : null;
        const summaryText = summary?.body || (typeof firstPr?.diffSummary === 'string' ? firstPr.diffSummary : firstPr?.title || 'no diff available');
        const fileDiffs = (firstPr?.changedFiles || []).map((p) => ({ path: p, diff: summaryText.slice(0, 1000) }));
        if (fileDiffs.length === 0) fileDiffs.push({ path: 'no-files', diff: story.title });
        await apiClient.post(
          `/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/ai-validations`,
          {
            issueKey: story.issueKey,
            issueDescription: story.title + (story.description ? `\n\n${story.description}` : ''),
            fileDiffs,
            prNumber: firstPr ? Number(firstPr.prNumber) : undefined,
          },
        ).catch((err) => console.warn(`validate ${story.issueKey} failed`, err));
      }
      await loadGithubData();
    } finally {
      setGhBulkBusy(null);
    }
  }

  async function runGithubAi() {
    setGhAiBusy(true);
    setGhError(null);
    try {
      const res = await apiClient.post(
        `/v1/teams/${TEAM_ID}/sprints/${SPRINT_ID}/grade-criterion-with-ai`,
        { criterion: { question: criterion.question || criterion.name, maxPoints: criterion.maxPoints } },
      );
      const data = res.data?.data || res.data || {};
      setGhAiSuggestion(data);
      const p = Math.round(Number(data.percent) || 0);
      onChange(p);
    } catch (err) {
      setGhError(err.response?.data?.message || err.message || 'AI grading failed');
    } finally {
      setGhAiBusy(false);
    }
  }

  function handleToggleGitHub() {
    const next = !showGitHub;
    setShowGitHub(next);
    if (next && ghPrs.length === 0 && !ghLoading) {
      loadGithubData();
    }
  }

  // Build the URL for the "Grade with GitHub & AI" tab (kept as an
  // optional secondary path; primary flow is now inline).
  const githubGradeUrl = (() => {
    if (!isGithubLlm) return null;
    const params = new URLSearchParams({
      team: TEAM_ID,
      sprint: SPRINT_ID,
      submission: submissionId || '',
      criterion: criterion.id || '',
      maxPoints: String(criterion.maxPoints || 100),
      question: criterion.question || criterion.name || '',
    });
    return `/professors/grade-with-github?${params.toString()}`;
  })();

  return (
    <div
      className="field"
      style={{
        borderLeft: `3px solid ${savedPercent != null && !dirty ? 'var(--accent-strong)' : 'var(--accent)'}`,
        paddingLeft: 12,
        marginBottom: 16,
        background: 'rgba(255,255,255,0.02)',
        padding: '10px 12px',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: '0.95rem' }}>{criterion.question}</strong>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {criterion.criterionType || 'SOFT'} · max {criterion.maxPoints} pts · weight {weightPct}%
        </span>
      </div>

      {isBinary ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: locked ? 'not-allowed' : 'pointer' }}>
          <input
            type="checkbox"
            checked={percent === 100}
            onChange={(e) => onChange(e.target.checked ? 100 : 0)}
            disabled={locked}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontWeight: percent === 100 ? 600 : 400 }}>
            {percent === 100 ? `Yes — full ${criterion.maxPoints} pts` : `No — 0 / ${criterion.maxPoints} pts`}
          </span>
        </label>
      ) : (
        <div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={locked}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={percent}
              onChange={(e) => {
                const raw = parseFloat(e.target.value);
                onChange(Number.isNaN(raw) ? 0 : Math.min(100, Math.max(0, raw)));
              }}
              disabled={locked}
              style={{ width: 80 }}
            />
            <span style={{ color: 'var(--muted)' }}>/ 100</span>
          </div>
        </div>
      )}

      <div className="field-help" style={{ marginTop: 6, fontSize: '0.85rem' }}>
        {percent}% &nbsp;→&nbsp; <strong>{points.toFixed(2)}</strong> / {criterion.maxPoints} pts
        {savedPercent != null && (
          <span style={{ marginLeft: 12, color: dirty ? 'var(--warning-ink, #d9822b)' : 'var(--accent-strong)' }}>
            {dirty ? '● unsaved changes' : '✓ saved'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => onSave(criterion.id)}
          disabled={busy || locked || !dirty}
        >
          {busy ? 'Saving…' : savedPercent != null ? 'Update this criterion' : 'Save this criterion'}
        </button>

        {isGithubLlm && (
          <button
            type="button"
            onClick={handleToggleGitHub}
            style={{ background: 'var(--accent-strong)', color: 'white' }}
          >
            {showGitHub ? '▴ Hide GitHub data' : '🤖 Inspect & grade with GitHub AI'}
          </button>
        )}

        {isGithubLlm && githubGradeUrl && (
          <a
            href={githubGradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.78rem', color: 'var(--muted)' }}
            title="Opens a new tab — same data, dedicated page."
          >
            (or open in a new tab ↗)
          </a>
        )}
      </div>

      {isGithubLlm && showGitHub && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: 'rgba(56,195,204,0.06)',
          border: '1px solid rgba(56,195,204,0.2)',
          borderRadius: 6,
        }}>
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
              <button
                type="button"
                onClick={runGithubAi}
                disabled={ghAiBusy || locked}
                style={{ background: 'var(--accent-strong)', color: 'white' }}
                title="Ask the local LLM to suggest a 0-100% score for THIS criterion based on the team's GitHub work."
              >
                {ghAiBusy ? 'Asking AI…' : '🤖 Run AI grading (this criterion)'}
              </button>

              <button
                type="button"
                onClick={runBulkPrReviewVerification}
                disabled={ghBulkBusy === 'reviews'}
                title="Loop through every stored PR and ask the AI whether a real code review took place."
              >
                {ghBulkBusy === 'reviews' ? `Verifying ${ghPrs.length} PR review${ghPrs.length === 1 ? '' : 's'}…` : `↻ Verify ${ghPrs.length} PR review${ghPrs.length === 1 ? '' : 's'}`}
              </button>

              <button
                type="button"
                onClick={runBulkIssueValidation}
                disabled={ghBulkBusy === 'validations' || ghStories.length === 0}
                title="Loop through every issue and ask the AI whether the linked PR's diff actually implements it."
              >
                {ghBulkBusy === 'validations' ? `Validating ${ghStories.length} issues…` : `🤖 Validate all ${ghStories.length} issues`}
              </button>

              <button
                type="button"
                onClick={loadGithubData}
                disabled={ghLoading}
                title="Re-fetch the latest data from the backend without running any AI."
              >
                {ghLoading ? 'Loading…' : '↻ Reload data'}
              </button>
            </div>

            {ghSignals && (
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', padding: '6px 8px', background: 'rgba(0,0,0,0.12)', borderRadius: 4 }}>
                <strong>Sprint signals:</strong>{' '}
                {ghSignals.reviewedPullRequestCount} / {ghSignals.pullRequestCount} PRs reviewed
                {' · '}
                {(ghSignals.reviewedRatio * 100).toFixed(0)}% reviewed ratio
                {' · '}
                {ghSignals.aiValidationCount} issues validated
                {' · '}
                {(ghSignals.matchedRatio * 100).toFixed(0)}% match score
              </div>
            )}

            {ghError && <span style={{ color: '#c92a2a', fontSize: '0.85rem' }}>⚠ {ghError}</span>}
          </div>

          {ghAiSuggestion && (
            <div style={{ marginBottom: 10, padding: 8, background: 'rgba(56,195,204,0.12)', borderRadius: 4, fontSize: '0.88rem' }}>
              🤖 AI suggests <strong>{ghAiSuggestion.percent}%</strong>
              {ghAiSuggestion.status ? ` (${ghAiSuggestion.status})` : ''}
              {ghAiSuggestion.feedback ? ` — ${ghAiSuggestion.feedback}` : ''}
              <span style={{ marginLeft: 8, color: 'var(--muted)' }}>
                · Adjust the slider above and click <em>Save this criterion</em> to keep the AI value or override it.
              </span>
            </div>
          )}

          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.9rem' }}>
              <strong>JIRA stories ({ghStories.length})</strong>
            </summary>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {ghStories.map((s) => (
                <li key={s.issueKey} style={{ marginBottom: 8 }}>
                  <strong>#{s.issueKey}</strong> · {s.title}
                  {' '}<span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>({s.status}{s.storyPoints != null ? `, ${s.storyPoints} pts` : ''})</span>
                  {s.description && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>description</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.18)', padding: 8, borderRadius: 4, marginTop: 4, fontSize: '0.78rem' }}>
                        {s.description}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </details>

          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.9rem' }}>
              <strong>Pull requests ({ghPrs.length})</strong>
            </summary>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {ghPrs.map((pr) => {
                const summary = pr.diffSummary && typeof pr.diffSummary === 'object' ? pr.diffSummary : null;
                const body = summary?.body || (typeof pr.diffSummary === 'string' ? pr.diffSummary : '');
                return (
                  <li key={pr.prNumber} style={{ marginBottom: 10 }}>
                    <strong>PR #{pr.prNumber}</strong> · {pr.title}
                    {' '}<span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                      → issue #{pr.issueKey} · {pr.mergeStatus || pr.prStatus} · review {pr.reviewVerified}
                    </span>
                    {pr.url && <> · <a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem' }}>open on GitHub ↗</a></>}
                    {summary?.author && (
                      <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                        by {summary.author}
                        {summary.createdAt ? ` · ${new Date(summary.createdAt).toLocaleDateString()}` : ''}
                      </div>
                    )}
                    {body && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>PR description</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.18)', padding: 8, borderRadius: 4, marginTop: 4, fontSize: '0.78rem' }}>
                          {body}
                        </pre>
                      </details>
                    )}
                    {pr.changedFiles?.length > 0 && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>{pr.changedFiles.length} changed files</summary>
                        <ul style={{ margin: '4px 0', paddingLeft: 16, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {pr.changedFiles.map((f) => <li key={f}>{f}</li>)}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>

          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.9rem' }}>
              <strong>AI implementation validations ({ghValidations.length})</strong>
            </summary>
            <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: '0.85rem' }}>
              {ghValidations.map((v) => (
                <li key={v.validationId || v.issueKey}>
                  <strong>#{v.issueKey}</strong> → <strong style={{ color: v.validationStatus === 'MATCHED' ? '#1f9e4a' : v.validationStatus === 'PARTIAL_MATCH' ? '#d9822b' : '#c92a2a' }}>
                    {v.validationStatus}
                  </strong>
                  {' '}(conf {Number(v.confidence ?? 0).toFixed(2)})
                  {v.feedback && <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{v.feedback}</div>}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

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
  const [percents, setPercents] = useState({});       // current UI value per criterion id
  const [savedPercents, setSavedPercents] = useState({}); // last persisted value per criterion id
  const [comments, setComments] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [savingComments, setSavingComments] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [serverFinalScore, setServerFinalScore] = useState(null);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [resolvedRubricName, setResolvedRubricName] = useState(submissionType || null);
  const [groupName, setGroupName] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        // Look up the submission so we always know which rubric (PROPOSAL/SOW)
        // to load and so we can show the team name + deliverable type.
        const submissionsRes = await apiClient.get('/v1/committee/submissions/pending').catch(() => null);
        const submission = submissionsRes?.data?.submissions?.find((s) => s.id === submissionId);
        const resolvedType = submissionType || submission?.type || null;
        if (resolvedType) setResolvedRubricName(resolvedType);
        if (submission?.group?.name) setGroupName(submission.group.name);

        const url = resolvedType
          ? `/v1/committee/rubric-criteria?deliverableType=${resolvedType}`
          : '/v1/committee/rubric-criteria';
        const [rubricRes, reviewRes] = await Promise.all([
          apiClient.get(url),
          apiClient.get(`/v1/committee/submissions/${submissionId}/my-review`).catch(() => ({ data: { review: null } })),
        ]);
        // Some rubrics (especially ones re-saved by the coordinator editor)
        // ship without an explicit `id` per criterion. Derive a stable slug
        // from the criterion name so the rest of the page (key={c.id},
        // saveCriterion, AI grading URL) keeps working.
        const slug = (s) => String(s || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          || 'criterion';
        const loaded = (rubricRes.data?.criteria || []).map((c, i) => ({
          ...c,
          id: c.id || `${slug(c.name)}-${i}`,
        }));
        setCriteria(loaded);

        const review = reviewRes.data?.review;
        const initialPercents = {};
        const initialSaved = {};
        loaded.forEach((c) => {
          const existing = review?.scores?.find((s) => s.criterionId === c.id);
          const pct = existing && c.maxPoints
            ? Math.round((Number(existing.value) / c.maxPoints) * 100)
            : 0;
          initialPercents[c.id] = pct;
          initialSaved[c.id] = existing ? pct : null;
        });
        setPercents(initialPercents);
        setSavedPercents(initialSaved);
        if (review?.comments) setComments(review.comments);
        if (review?.finalScore != null) setServerFinalScore(review.finalScore);
      } catch (err) {
        if (err.response?.status === 401) {
          notify({ type: 'warning', title: 'Login required', message: 'Please sign in as a professor.' });
          navigate('/login', { replace: true });
          return;
        }
        setFeedback({ status: 'error', title: 'Load Failed', result: err.response?.data?.message || 'Failed to load rubric.' });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [navigate, notify, submissionId, submissionType]);

  const totals = useMemo(() => {
    let totalPossible = 0;
    let earned = 0;
    let weighted = 0;
    let totalWeight = 0;
    let savedCount = 0;
    for (const c of criteria) {
      const max = Number(c.maxPoints) || 0;
      const w = Number(c.weight) || 0;
      const pct = percents[c.id] ?? 0;
      totalPossible += max;
      earned += (pct / 100) * max;
      weighted += pct * w;
      totalWeight += w;
      if (savedPercents[c.id] != null) savedCount += 1;
    }
    return {
      totalPossible,
      earned,
      finalPercent: totalWeight > 0 ? weighted / totalWeight : 0,
      savedCount,
    };
  }, [criteria, percents, savedPercents]);

  // Re-fetch the saved review state from the backend. Used by:
  //   • the periodic poll while the page is open
  //   • the storage event fired when the GitHub-AI grading tab saves
  //   • the postMessage from window.opener for the same reason
  async function refreshSavedReview() {
    try {
      const reviewRes = await apiClient.get(`/v1/committee/submissions/${submissionId}/my-review`);
      const review = reviewRes.data?.review;
      if (!review) return;
      setSavedPercents((prev) => {
        const next = { ...prev };
        for (const c of criteria) {
          const existing = review.scores?.find((s) => s.criterionId === c.id);
          if (existing && c.maxPoints) {
            next[c.id] = Math.round((Number(existing.value) / c.maxPoints) * 100);
          }
        }
        return next;
      });
      setPercents((cur) => {
        const next = { ...cur };
        for (const c of criteria) {
          const existing = review.scores?.find((s) => s.criterionId === c.id);
          if (existing && c.maxPoints) {
            next[c.id] = Math.round((Number(existing.value) / c.maxPoints) * 100);
          }
        }
        return next;
      });
      if (review.finalScore != null) setServerFinalScore(review.finalScore);
      if (review.comments) setComments(review.comments);
    } catch (_) { /* swallow — not critical */ }
  }

  // Listen for "I saved a criterion in another tab" events. The most reliable
  // signal is a periodic poll because:
  //   • `rel="noopener"` blocks `window.opener.postMessage`
  //   • the `storage` event is unreliable in some Chrome versions / private mode
  //   • some browsers debounce focus events
  // So in addition to listening to those events, we re-fetch /my-review every
  // 4 seconds whenever this tab is visible. Cheap (one tiny GET) and bullet-
  // proof: the saved score in the GitHub-AI tab shows up here within 4s.
  useEffect(() => {
    if (!submissionId || criteria.length === 0) return;
    const onStorage = (e) => {
      if (e.key === `committee-grade-saved:${submissionId}` && e.newValue) refreshSavedReview();
    };
    const onMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'COMMITTEE_GRADE_SAVED' && e.data?.payload?.submissionId === submissionId) {
        refreshSavedReview();
      }
    };
    const onFocus = () => refreshSavedReview();
    const onVisibility = () => { if (!document.hidden) refreshSavedReview(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const pollId = setInterval(() => {
      if (!document.hidden) refreshSavedReview();
    }, 4_000);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, criteria.length]);

  async function saveCriterion(id) {
    const criterion = criteria.find((c) => c.id === id);
    if (!criterion) return;
    setBusyId(id);
    setFeedback(null);
    try {
      const pct = percents[id] ?? 0;
      const value = Number((((pct / 100) * (Number(criterion.maxPoints) || 0))).toFixed(2));
      const res = await apiClient.post(`/v1/committee/submissions/${submissionId}/grade`, {
        scores: [{ criterionId: id, value }],
      });
      setSavedPercents((prev) => ({ ...prev, [id]: pct }));
      const fs = res.data?.finalScore ?? res.data?.data?.finalScore;
      if (typeof fs === 'number') setServerFinalScore(fs);
      if (res.data?.complete) setComplete(true);
      setFeedback({ status: 'success', title: 'Saved', result: `${criterion.question}: ${pct}% saved.` });
    } catch (err) {
      const errorData = err.response?.data || {};
      setFeedback({ status: 'error', title: errorData.code || 'Save failed', result: errorData.message || 'Failed to save criterion.' });
    } finally {
      setBusyId(null);
    }
  }

  async function saveComments() {
    setSavingComments(true);
    setFeedback(null);
    try {
      // Comments piggy-back on the same /grade endpoint with a no-op-ish score
      // (we send the first criterion's already-saved value so nothing changes).
      const first = criteria[0];
      const pct = percents[first?.id] ?? savedPercents[first?.id] ?? 0;
      const value = first ? Number((((pct / 100) * (Number(first.maxPoints) || 0))).toFixed(2)) : 0;
      await apiClient.post(`/v1/committee/submissions/${submissionId}/grade`, {
        scores: first ? [{ criterionId: first.id, value }] : [],
        comments: comments.trim() || null,
      });
      setFeedback({ status: 'success', title: 'Comments saved', result: '' });
    } catch (err) {
      setFeedback({ status: 'error', title: 'Could not save comments', result: err.response?.data?.message || err.message });
    } finally {
      setSavingComments(false);
    }
  }

  if (isLoading) {
    return <div className="page"><div className="feedback feedback-loading"><h2>Loading rubric…</h2></div></div>;
  }

  return (
    <div className="page">
      <div className="back-link-wrap">
        <Link className="back-link" to="/professors/committee-submissions">← Back to Submissions</Link>
      </div>

      <div className="hero">
        <p className="eyebrow">
          {resolvedRubricName ? `${resolvedRubricName} Rubric` : 'Submission Review'}
          {groupName ? ` · ${groupName}` : ''}
        </p>
        <h1>Grade {resolvedRubricName || 'Submission'}</h1>
        <p className="subtitle">
          Each criterion is graded independently — adjust the percentage and click <em>Save</em> on
          that criterion. Saved values persist immediately. The submission is marked <strong>GRADED</strong>
          once every criterion has a saved score. This page polls the server every 4 s so saves done
          in another tab (e.g. the GitHub-AI grading tab) appear here automatically.
        </p>
        <p>
          <button type="button" onClick={refreshSavedReview} style={{ marginTop: 8 }}>
            🔄 Refresh from server now
          </button>
        </p>
      </div>

      <div className="panel">
        <form className="form" onSubmit={(e) => e.preventDefault()}>
          {criteria.length === 0 ? (
            <div className="feedback feedback-warning">
              <div className="feedback-label">notice</div>
              <h2>No Rubric Criteria</h2>
              <p>No grading criteria are configured. Ask the coordinator to seed a rubric.</p>
            </div>
          ) : (
            criteria.map((c) => (
              <CriterionCard
                key={c.id}
                criterion={c}
                percent={percents[c.id] ?? 0}
                savedPercent={savedPercents[c.id]}
                busy={busyId === c.id}
                locked={complete}
                onChange={(p) => setPercents((cur) => ({ ...cur, [c.id]: p }))}
                onSave={saveCriterion}
                submissionId={submissionId}
              />
            ))
          )}

          {criteria.length > 0 && (
            <>
              <div className="feedback feedback-idle" style={{ marginTop: 12 }}>
                <div className="feedback-label">live total</div>
                <p style={{ margin: 0 }}>
                  Saved {totals.savedCount} / {criteria.length} criteria.
                  &nbsp;Earned: <strong>{totals.earned.toFixed(2)}</strong> / {totals.totalPossible} pts.
                  &nbsp;Weighted: <strong>{totals.finalPercent.toFixed(1)}</strong> / 100.
                  {serverFinalScore != null && (
                    <>
                      &nbsp;<span style={{ color: 'var(--muted)' }}>(server: {Number(serverFinalScore).toFixed(1)})</span>
                    </>
                  )}
                </p>
              </div>

              <label className="field">
                <span>General Comments (optional)</span>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Optional comments about the submission…"
                  disabled={complete}
                />
              </label>
              <button type="button" onClick={saveComments} disabled={savingComments || complete}>
                {savingComments ? 'Saving…' : 'Save comments'}
              </button>
            </>
          )}
        </form>

        <div className="side-column">
          {feedback && (
            <div className={`feedback feedback-${feedback.status}`} aria-live="polite">
              <div className="feedback-label">{feedback.status}</div>
              {feedback.title && <h2 style={{ marginTop: 0 }}>{feedback.title}</h2>}
              {feedback.result && <p>{feedback.result}</p>}
            </div>
          )}

          {complete && serverFinalScore != null && (
            <div className="feedback feedback-idle">
              <div className="feedback-label">complete</div>
              <h2 style={{ fontSize: '3rem', color: 'var(--accent-strong)', margin: '0 0 4px' }}>
                {Number(serverFinalScore).toFixed(1)}
              </h2>
              <p style={{ color: 'var(--muted)', margin: 0 }}>out of 100</p>
              <button type="button" onClick={() => navigate('/professors/committee-submissions')} style={{ marginTop: 12 }}>
                Back to Submissions
              </button>
            </div>
          )}

          {criteria.length > 0 && (
            <div className="feedback feedback-idle">
              <div className="feedback-label">rubric</div>
              <h2 style={{ marginTop: 0 }}>{submissionType || 'Rubric criteria'}</h2>
              {criteria.map((c) => (
                <div key={c.id} style={{ marginBottom: 8 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.88rem' }}>{c.question}</p>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {c.criterionType} · {c.maxPoints} pts · weight {Math.round((c.weight || 0) * 100)}%
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
