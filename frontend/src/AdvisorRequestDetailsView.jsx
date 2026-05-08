import React, { useEffect, useState } from 'react';
import apiClient from './services/apiClient';

function AdvisorRequestDetailsView({ requestId, authToken, onClose }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRequestDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!authToken?.trim()) {
          throw new Error('Student token is required to fetch advisor request details');
        }

        const { data } = await apiClient.get(`/v1/advisor-requests/${requestId}`);
        setRequest(data);
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'An error occurred while fetching request details');
        console.error('Error fetching advisor request:', err);
      } finally {
        setLoading(false);
      }
    };

    if (requestId) {
      fetchRequestDetails();
    }
  }, [authToken, requestId]);

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'PENDING':
        return 'badge-pending';
      case 'APPROVED':
        return 'badge-approved';
      case 'REJECTED':
        return 'badge-rejected';
      case 'CANCELLED':
        return 'badge-cancelled';
      default:
        return 'badge-default';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const professorUser = request?.professor?.user || request?.advisor || null;
  const teamLeader = request?.group?.teamLeader || request?.teamLeader || null;

  if (loading) {
    return (
      <div className="advisor-request-view loading">
        <p>Loading advisor request details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="advisor-request-view error">
        <p className="error-message">{error}</p>
        {onClose && (
          <button onClick={onClose} className="btn-close">
            Close
          </button>
        )}
      </div>
    );
  }

  if (!request) {
    return (
      <div className="advisor-request-view not-found">
        <p>Advisor request not found</p>
        {onClose && (
          <button onClick={onClose} className="btn-close">
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="advisor-request-view">
      <div className="request-header">
        <h2>Advisor Request Details</h2>
        {onClose && (
          <button onClick={onClose} className="btn-close">
            X
          </button>
        )}
      </div>

      <div className="request-content">
        <div className="request-section">
          <h3>Request Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Request ID</label>
              <span className="value">{request.id}</span>
            </div>
            <div className="info-item">
              <label>Status</label>
              <span className={`value badge ${getStatusBadgeClass(request.status)}`}>
                {request.status}
              </span>
            </div>
            <div className="info-item">
              <label>Professor ID</label>
              <span className="value">{request.professorId ?? request.advisorId}</span>
            </div>
            <div className="info-item">
              <label>Group ID</label>
              <span className="value">{request.groupId}</span>
            </div>
            <div className="info-item">
              <label>Created</label>
              <span className="value">{formatDate(request.createdAt)}</span>
            </div>
            {request.updatedAt && (
              <div className="info-item">
                <label>Last Updated</label>
                <span className="value">{formatDate(request.updatedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {request.group && (
          <div className="request-section">
            <h3>Group Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Group Name</label>
                <span className="value">{request.group.name}</span>
              </div>
              {teamLeader && (
                <>
                  <div className="info-item">
                    <label>Team Leader</label>
                    <span className="value">{teamLeader.fullName}</span>
                  </div>
                  <div className="info-item">
                    <label>Team Leader Email</label>
                    <span className="value">{teamLeader.email}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {(request.advisor || request.professor) && (
          <div className="request-section">
            <h3>Requested Advisor</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Name</label>
                <span className="value">{professorUser?.fullName}</span>
              </div>
              <div className="info-item">
                <label>Email</label>
                <span className="value">{professorUser?.email}</span>
              </div>
              {request.professor?.department && (
                <div className="info-item">
                  <label>Department</label>
                  <span className="value">{request.professor.department}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {request.decisionNote && (
          <div className="request-section">
            <h3>Decision Note</h3>
            <div className="decision-note">
              <p>{request.decisionNote}</p>
            </div>
          </div>
        )}
      </div>

      {onClose && (
        <div className="request-footer">
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export default AdvisorRequestDetailsView;
