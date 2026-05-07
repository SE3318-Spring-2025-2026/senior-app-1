
import { Link, useParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import SprintEvaluationTrigger from './components/SprintEvaluationTrigger';


export default function SprintEvaluationPage() {
  const { teamId, sprintId } = useParams();
  const { user } = useAuth();

  return (
    <main className="page page-group-view">
      <section className="hero group-page-header">
        <p className="eyebrow">Sprint Monitoring</p>
        <h1>Run Sprint Evaluation</h1>
        <p className="group-page-status">Team {teamId} / Sprint {sprintId}</p>
      </section>

      <section className="group-details-card">
        <SprintEvaluationTrigger teamId={teamId} sprintId={sprintId} userId={user?.id} />
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to={`/students/groups/${teamId}/integrations`}>Back to Integrations</Link>
      </p>
    </main>
  );
}
