import { useState } from 'react';
import { Link } from 'react-router-dom';
import AiFeaturesPanel from './components/AiFeaturesPanel';

const DEMO_TEAMS = [
  { id: 'team-demo-001', name: 'Demo Senior Project Group' },
  { id: 'team-demo-002', name: 'Demo Project Group Two' },
];

const DEMO_SPRINTS = ['sprint-2026-05'];

/**
 * Single landing page that shows the AI Sprint Insights panel for any logged-in
 * user (admin / coordinator / professor / student). Pick a team + sprint and
 * the existing AiFeaturesPanel handles the rest. Linked from every role's
 * sidebar so the AI features are reachable in one click.
 */
export default function AiInsightsPage() {
  const [teamId, setTeamId] = useState(DEMO_TEAMS[0].id);
  const [sprintId, setSprintId] = useState(DEMO_SPRINTS[0]);

  return (
    <main className="page page-group-view">
      <section className="hero">
        <p className="eyebrow">AI Sprint Insights</p>
        <h1>PR Review Verification &amp; Implementation Validation</h1>
        <p className="subtitle">
          Pick a team and sprint to see what the AI thinks about their pull-request reviews
          and issue implementations. Trigger AI runs from this page; results stream back into
          the team's evaluation aggregation.
        </p>
      </section>

      <section className="group-details-card">
        <div className="form-group" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 240 }}>
            <span>Team</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {DEMO_TEAMS.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
              ))}
            </select>
          </label>

          <label className="field" style={{ minWidth: 240 }}>
            <span>Sprint</span>
            <select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              {DEMO_SPRINTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="group-details-card">
        <AiFeaturesPanel teamId={teamId} sprintId={sprintId} />
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/home">← Back to Home</Link>
      </p>
    </main>
  );
}
