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

  // Build the URL for the "Grade with GitHub & AI" tab. We pass the
  // submission + criterion + max points so the new tab can save back into
  // the same review.
  const githubGradeUrl = (() => {
    if (!isGithubLlm) return null;
    const params = new URLSearchParams({
      team: 'team-demo-001',
      sprint: 'sprint-2026-05',
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

        {isGithubLlm && githubGradeUrl && (
          <a
            href={githubGradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gateway-link"
            style={{
              background: 'var(--accent-strong)',
              color: 'white',
              padding: '6px 12px',
              borderRadius: 4,
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
            title="Opens a new tab with the team's GitHub data — grade manually or run the AI from there."
          >
            🤖 Grade with GitHub &amp; AI ↗
          </a>
        )}

        {isGithubLlm && (
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            (this criterion is AI-gradable from the team's GitHub work)
          </span>
        )}
      </div>

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
          once every criterion has a saved score.
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
