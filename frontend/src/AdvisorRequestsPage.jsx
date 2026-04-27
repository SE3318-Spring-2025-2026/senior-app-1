import React, { useEffect, useState } from 'react';
import apiClient from './services/apiClient';

export default function AdvisorRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient.get('/advisor-requests?status=PENDING')
      .then(res => setRequests(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDecision = async (requestId, decision) => {
    try {
      await apiClient.patch(`/advisor-requests/${requestId}/decision`, { decision });
      setRequests(r => r.filter(req => req.id !== requestId));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Pending Advisor Requests</h2>
      {requests.length === 0 ? <div>No pending requests.</div> : (
        <ul>
          {requests.map(req => (
            <li key={req.id}>
              Group #{req.groupId} — Team Leader #{req.teamLeaderId}
              <button onClick={() => handleDecision(req.id, 'APPROVED')}>Approve</button>
              <button onClick={() => handleDecision(req.id, 'REJECTED')}>Reject</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
