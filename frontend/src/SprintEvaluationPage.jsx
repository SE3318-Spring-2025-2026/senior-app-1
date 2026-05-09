import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import SprintEvaluationTrigger from './components/SprintEvaluationTrigger';
import AiFeaturesPanel from './components/AiFeaturesPanel';
import { getCurrentSprintMonitoringSnapshot } from './services/sprintMonitoring';

export default function SprintEvaluationPage() {
  const { teamId, sprintId: routeSprintId } = useParams();
  const { user } = useAuth();
  const [sprintId, setSprintId] = useState(routeSprintId || '');
  const [resolveError, setResolveError] = useState(null);

  // Auto-resolve to the active sprint when none is specified in the URL.
  useEffect(() => {
    if (sprintId || !teamId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getCurrentSprintMonitoringSnapshot(teamId, { includeStale: true });
        const resolved = data?.data?.resolvedSprint?.sprintId || data?.resolvedSprint?.sprintId || data?.sprintId;
        if (!cancelled && resolved) setSprintId(resolved);
      } catch (err) {
        if (!cancelled) setResolveError(err.message || 'Could not auto-resolve active sprint');
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, sprintId]);

  return (
    <main className="page page-group-view">
      <section className="hero group-page-header">
        <p className="eyebrow">Sprint Monitoring</p>
        <h1>Run Sprint Evaluation</h1>
        <p className="group-page-status">Team {teamId} / Sprint {sprintId || '—'}</p>
      </section>

      <section className="group-details-card">
        <label className="field" style={{ display: 'block', maxWidth: 320, marginBottom: 12 }}>
          <span>Sprint ID</span>
          <input
            type="text"
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
            placeholder="e.g. sprint-2026-05"
          />
        </label>
        {resolveError && (
          <p style={{ color: '#c00', fontSize: 12 }}>
            Could not auto-resolve active sprint — enter one above. ({resolveError})
          </p>
        )}
        {!sprintId && (
          <p style={{ color: '#888', fontSize: 13 }}>
            Pick a sprint to load the evaluation trigger and AI insights.
          </p>
        )}
      </section>

      {sprintId && (
        <>
          <section className="group-details-card">
            <SprintEvaluationTrigger teamId={teamId} sprintId={sprintId} userId={user?.id} />
          </section>

          <section className="group-details-card">
            <AiFeaturesPanel teamId={teamId} sprintId={sprintId} />
          </section>
        </>
      )}

      <p className="back-link-wrap">
        <Link className="back-link" to={`/students/groups/${teamId}/integrations`}>Back to Integrations</Link>
      </p>
    </main>
  );
}
