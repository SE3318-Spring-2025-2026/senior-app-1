import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import AdvisorRequestDetailsView from './AdvisorRequestDetailsView';
import { useAuth } from './contexts/AuthContext';

export default function TeamLeaderAdvisorRequestDetailsPage() {
  const { requestId } = useParams();
  const { token } = useAuth();

  const normalizedRequestId = useMemo(() => (requestId || '').trim(), [requestId]);

  return (
    <section className="page">
      <div className="hero">
        <p className="eyebrow">Team Leader</p>
        <h1>Advisor Request Detail</h1>
        <p className="subtitle">
          View the current professor, group, and status for a submitted advisor request.
        </p>
      </div>

      <AdvisorRequestDetailsView requestId={normalizedRequestId} authToken={token || ''} />
    </section>
  );
}
