import { useEffect, useState } from 'react';

function formatDate(value) {
  if (!value) {
    return 'Now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }

  return date.toLocaleString();
}

function formatStatus(value) {
  if (!value) {
    return 'Pending';
  }

  return value
    .toString()
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSubject(entry) {
  const groupName = entry.groupName || entry.groupId || 'Unknown group';
  return `${groupName} advisor request`;
}

function buildPreview(entry) {
  return entry.message || 'A team leader submitted an advisor request for your review.';
}

export default function ProfessorAdvisorRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [submittingDecision, setSubmittingDecision] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const token = window.localStorage.getItem('professorToken') || window.localStorage.getItem('authToken');

    async function loadRequests() {
      try {
        const response = await fetch('/api/v1/advisors/notifications/advisee-requests', {
          headers: token
            ? {
              Authorization: `Bearer ${token}`,
            }
            : {},
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => []);

        if (!response.ok) {
          setLoadError('Advisor requests could not be loaded.');
          setRequests([]);
          return;
        }

        const rows = Array.isArray(payload) ? payload : payload.notifications || [];
        setRequests(rows);
        setSelectedRequestId((current) => current || rows[0]?.id || null);
        setLoadError('');
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        setLoadError('Advisor requests could not be loaded.');
        setRequests([]);
      } finally {
        setLoading(false);
      }
    }

    loadRequests();

    return () => controller.abort();
  }, []);

  const selectedRequest = requests.find((entry) => entry.id === selectedRequestId) || null;
  const selectedRequestBusy = selectedRequest && submittingDecision === selectedRequest.requestId;
  const canDecide = selectedRequest?.requestId && selectedRequest?.requestStatus === 'PENDING';

  async function handleDecision(decision) {
    if (!selectedRequest?.requestId) {
      setFeedback('This advisor request cannot be decided because its request id is missing.');
      return;
    }

    setSubmittingDecision(selectedRequest.requestId);
    setFeedback('');

    try {
      const token = window.localStorage.getItem('professorToken') || window.localStorage.getItem('authToken');
      const response = await fetch(`/api/v1/advisor-requests/${selectedRequest.requestId}/decision`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ decision }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(payload.message || 'Advisor request decision could not be saved.');
        return;
      }

      const nextStatus = payload.status || (decision === 'APPROVE' ? 'APPROVED' : 'REJECTED');
      setRequests((current) => current.map((entry) => (
        entry.requestId === selectedRequest.requestId
          ? {
            ...entry,
            requestStatus: nextStatus,
            note: payload.note ?? entry.note ?? null,
            decidedAt: payload.decidedAt ?? new Date().toISOString(),
          }
          : entry
      )));
      setFeedback(`Request ${nextStatus.toLowerCase()} successfully.`);
    } catch {
      setFeedback('Advisor request decision could not be saved.');
    } finally {
      setSubmittingDecision('');
    }
  }

  return (
    <main className="page page-mailbox">
      <section className="hero">
        <p className="eyebrow">Advisor Inbox</p>
        <h1>Incoming advisor requests</h1>
        <p className="subtitle">
          Review requests submitted by team leaders. New entries are fetched from the backend when this page opens.
        </p>
      </section>

      <section className="single-panel">
        {loading && (
          <p className="mail-state" aria-live="polite">Loading advisor requests...</p>
        )}

        {!loading && loadError && (
          <p className="mail-state" aria-live="polite">{loadError}</p>
        )}

        {!loading && !loadError && requests.length === 0 && (
          <p className="mail-state" aria-live="polite">No incoming advisor requests.</p>
        )}

        {!loading && !loadError && requests.length > 0 && (
          <div className="mail-layout">
            <aside className="mail-sidebar" aria-label="Advisor request list">
              <div className="mail-sidebar-header">
                <p className="mailbox-title">Advisor Requests</p>
                <p className="mailbox-count">{requests.length} requests</p>
              </div>

              <section className="mail-nav">
                {requests.map((entry) => {
                  const isActive = entry.id === selectedRequestId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`mail-nav-item${isActive ? ' mail-nav-item-active' : ''}`}
                      onClick={() => setSelectedRequestId(entry.id)}
                    >
                      <span className="mail-nav-time">{formatDate(entry.createdAt)}</span>
                      <span className="mail-nav-subject">{buildSubject(entry)}</span>
                      <span className="mail-nav-preview">{buildPreview(entry)}</span>
                    </button>
                  );
                })}
              </section>
            </aside>

            <section className="mail-detail" aria-live="polite">
              {selectedRequest ? (
                <>
                  <div className="mail-detail-header">
                    <div>
                      <span className="mail-topic">Advisee Request</span>
                      <h2 className="mail-subject">{buildSubject(selectedRequest)}</h2>
                    </div>
                    <span className="mail-time">{formatDate(selectedRequest.createdAt)}</span>
                  </div>

                  <p className="mail-preview">{buildPreview(selectedRequest)}</p>

                  <dl className="mail-detail-grid">
                    <div>
                      <dt>Group</dt>
                      <dd>{selectedRequest.groupName || selectedRequest.groupId || 'Not specified'}</dd>
                    </div>
                    <div>
                      <dt>Request Status</dt>
                      <dd>{formatStatus(selectedRequest.requestStatus)}</dd>
                    </div>
                    <div>
                      <dt>Request ID</dt>
                      <dd>{selectedRequest.requestId || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Notification State</dt>
                      <dd>{formatStatus(selectedRequest.status)}</dd>
                    </div>
                  </dl>

                  {canDecide && (
                    <div className="mail-actions">
                      <button
                        type="button"
                        disabled={Boolean(selectedRequestBusy)}
                        onClick={() => handleDecision('APPROVE')}
                      >
                        {selectedRequestBusy ? 'Saving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(selectedRequestBusy)}
                        onClick={() => handleDecision('REJECT')}
                      >
                        {selectedRequestBusy ? 'Saving...' : 'Reject'}
                      </button>
                    </div>
                  )}

                  {!canDecide && selectedRequest?.requestStatus !== 'PENDING' && (
                    <p className="mail-state" aria-live="polite">
                      This request has already been {formatStatus(selectedRequest.requestStatus).toLowerCase()}.
                    </p>
                  )}

                  {feedback && (
                    <p className="mail-state" aria-live="polite">{feedback}</p>
                  )}
                </>
              ) : (
                <p className="mail-detail-empty">Select a request to review its details.</p>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
