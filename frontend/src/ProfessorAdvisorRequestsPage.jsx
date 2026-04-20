import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function getProfessorToken() {
  return window.localStorage.getItem('professorToken') || window.localStorage.getItem('authToken');
}

function parseNotificationRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.notifications)) {
    return payload.notifications;
  }

  return [];
}

function normalizeAdviseeNotification(entry) {
  const advisorRequest = entry?.advisorRequest || {};
  const group = advisorRequest?.group || {};

  return {
    id: entry?.id,
    requestId: entry?.requestId || advisorRequest?.id || null,
    requestStatus: entry?.requestStatus || advisorRequest?.status || null,
    groupId: entry?.groupId || advisorRequest?.groupId || null,
    groupName: entry?.groupName || group?.name || null,
    createdAt: entry?.createdAt || advisorRequest?.createdAt || null,
    status: entry?.status || (entry?.isRead ? 'READ' : 'UNREAD'),
    isRead: Boolean(entry?.isRead || entry?.status === 'READ'),
    message: entry?.message || null,
    note: entry?.note ?? null,
    decidedAt: entry?.decidedAt ?? null,
  };
}

function normalizeTransferNotification(entry) {
  const group = entry?.group || {};

  return {
    id: entry?.id,
    groupId: entry?.groupId || null,
    groupName: entry?.groupName || group?.name || null,
    createdAt: entry?.createdAt || null,
    status: entry?.status || (entry?.isRead ? 'READ' : 'UNREAD'),
    isRead: Boolean(entry?.isRead || entry?.status === 'READ'),
    message: entry?.message || entry?.reason || null,
    reason: entry?.reason || null,
  };
}

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

function buildTransferSubject(entry) {
  const groupName = entry.groupName || entry.groupId || 'Unknown group';
  return `${groupName} transfer notification`;
}

function buildTransferPreview(entry) {
  return entry.reason || entry.message || 'A new group has been assigned to you through transfer.';
}

export default function ProfessorAdvisorRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [transferNotifications, setTransferNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [transferLoadError, setTransferLoadError] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [submittingDecision, setSubmittingDecision] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  useEffect(() => {
    let active = true;
    let timeoutId;
    const token = getProfessorToken();

    async function loadRequests() {
      const controller = new AbortController();

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
          if (!active) {
            return;
          }

          setLoadError('Advisor requests could not be loaded.');
          setRequests([]);
          return;
        }

        if (!active) {
          return;
        }

        const rows = parseNotificationRows(payload).map(normalizeAdviseeNotification);
        setRequests(rows);
        setSelectedRequestId((current) => (
          rows.some((entry) => entry.id === current) ? current : rows[0]?.id || null
        ));
        setLoadError('');
      } catch (error) {
        if (error.name === 'AbortError' || !active) {
          return;
        }

        setLoadError('Advisor requests could not be loaded.');
        setRequests([]);
      } finally {
        if (!active) {
          return;
        }

        setLoading(false);
        timeoutId = window.setTimeout(loadRequests, 15000);
      }
    }

    loadRequests();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId;
    const token = getProfessorToken();

    async function loadTransfers() {
      try {
        const response = await fetch('/api/v1/advisors/notifications/group-transfers', {
          headers: token
            ? {
              Authorization: `Bearer ${token}`,
            }
            : {},
        });

        const payload = await response.json().catch(() => []);

        if (!active) {
          return;
        }

        if (!response.ok) {
          setTransferLoadError('Group transfer notifications could not be loaded.');
          setTransferNotifications([]);
        } else {
          const rows = parseNotificationRows(payload).map(normalizeTransferNotification);
          setTransferNotifications(rows);
          setTransferLoadError('');
        }
      } catch {
        if (!active) {
          return;
        }

        setTransferLoadError('Group transfer notifications could not be loaded.');
        setTransferNotifications([]);
      } finally {
        if (!active) {
          return;
        }

        setLoadingTransfers(false);
        timeoutId = window.setTimeout(loadTransfers, 15000);
      }
    }

    loadTransfers();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const selectedRequest = requests.find((entry) => entry.id === selectedRequestId) || null;
  const selectedRequestBusy = selectedRequest && submittingDecision === selectedRequest.requestId;
  const canDecide = selectedRequest?.requestId && selectedRequest?.requestStatus === 'PENDING';
  const pendingRequestCount = requests.filter((entry) => entry.requestStatus === 'PENDING').length;
  const unreadTransferCount = transferNotifications.filter((entry) => !entry.isRead).length;

  async function markNotificationAsRead(type, id) {
    const token = getProfessorToken();
    if (!token || !id) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/advisors/notifications/${type}/${id}/read`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return;
      }

      if (type === 'advisee-request') {
        setRequests((current) => current.map((entry) => (
          entry.id === id
            ? {
              ...entry,
              status: 'READ',
              isRead: true,
            }
            : entry
        )));
        return;
      }

      setTransferNotifications((current) => current.map((entry) => (
        entry.id === id
          ? {
            ...entry,
            status: 'READ',
            isRead: true,
          }
          : entry
      )));
    } catch {
      // Keep mailbox interaction resilient; a failed read update should not block the UI.
    }
  }

  async function handleDecision(decision) {
    if (!selectedRequest?.requestId) {
      setFeedback({
        type: 'error',
        message: 'This advisor request cannot be decided because its request id is missing.',
      });
      return;
    }

    setSubmittingDecision(selectedRequest.requestId);
    setFeedback({ type: '', message: '' });

    try {
      const token = getProfessorToken();
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
        setFeedback({
          type: 'error',
          message: payload.message || 'Advisor request decision could not be saved.',
        });
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
      setFeedback({
        type: 'success',
        message: payload.message || `Request ${nextStatus.toLowerCase()} successfully.`,
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Advisor request decision could not be saved.',
      });
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
          Review requests submitted by team leaders and monitor newly transferred groups. Notifications refresh automatically while this page stays open.
        </p>
      </section>

      <section className="mail-summary-grid professor-mail-summary">
        <article className="mail-category-panel">
          <div className="mail-category-header">
            <p className="mail-category-eyebrow">Advisor Requests</p>
            <div className="mail-category-heading">
              <h2>Decision queue</h2>
              <span className="mail-category-count">{requests.length}</span>
            </div>
          </div>
          <div className="mailbox-stat-row">
            <div className="mailbox-stat">
              <span>Pending</span>
              <strong>{pendingRequestCount}</strong>
            </div>
            <div className="mailbox-stat">
              <span>Resolved</span>
              <strong>{Math.max(requests.length - pendingRequestCount, 0)}</strong>
            </div>
          </div>
        </article>

        <article className="mail-category-panel">
          <div className="mail-category-header">
            <p className="mail-category-eyebrow">Transfers</p>
            <div className="mail-category-heading">
              <h2>Assigned groups</h2>
              <span className="mail-category-count">{transferNotifications.length}</span>
            </div>
          </div>
          <div className="mailbox-stat-row">
            <div className="mailbox-stat">
              <span>Unread</span>
              <strong>{unreadTransferCount}</strong>
            </div>
            <div className="mailbox-stat">
              <span>Latest</span>
              <strong>{transferNotifications[0] ? formatDate(transferNotifications[0].createdAt) : 'None'}</strong>
            </div>
          </div>
        </article>
      </section>

      {feedback.message && (
        <p className={`mail-state mail-state-${feedback.type || 'info'}`} aria-live="polite">
          {feedback.message}
        </p>
      )}

      <section className="mail-workspace">
        <aside className="mail-inbox-shell mail-sidebar" aria-label="Advisor request list">
          <div className="mail-sidebar-header">
            <p className="mailbox-title">Advisor Requests</p>
            <p className="mailbox-count">{requests.length} requests</p>
          </div>

          {loading && (
            <p className="mail-state" aria-live="polite">Loading advisor requests...</p>
          )}

          {!loading && loadError && (
            <p className="mail-state mail-state-error" aria-live="polite">{loadError}</p>
          )}

          {!loading && !loadError && requests.length === 0 && (
            <p className="mail-state" aria-live="polite">No incoming advisor requests.</p>
          )}

          {!loading && !loadError && requests.length > 0 && (
            <section className="mail-nav" aria-label="Advisor request list">
              {requests.map((entry) => {
                const isActive = entry.id === selectedRequestId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`mail-nav-item${isActive ? ' mail-nav-item-active' : ''}`}
                    onClick={() => {
                      setSelectedRequestId(entry.id);
                      if (!entry.isRead) {
                        markNotificationAsRead('advisee-request', entry.id);
                      }
                    }}
                  >
                    <span className="mail-nav-time">{formatDate(entry.createdAt)}</span>
                    <span className="mail-nav-subject">{buildSubject(entry)}</span>
                    <span className="mail-nav-preview">{buildPreview(entry)}</span>
                  </button>
                );
              })}
            </section>
          )}
        </aside>

        <section className="mail-inbox-shell mail-detail professor-mail-detail" aria-live="polite">
          {selectedRequest ? (
            <>
              <div className="mail-detail-header">
                <div>
                  <span className="mail-topic">Advisee Request</span>
                  <h2 className="mail-subject">{buildSubject(selectedRequest)}</h2>
                </div>
                <span className="mail-time">{formatDate(selectedRequest.createdAt)}</span>
              </div>

              <div className="mail-meta">
                <span className="mail-status">{formatStatus(selectedRequest.requestStatus)}</span>
                <span className="mail-group">{selectedRequest.groupName || selectedRequest.groupId || 'Unknown group'}</span>
              </div>

              <p className="mail-preview">{buildPreview(selectedRequest)}</p>

              <dl className="mail-detail-grid">
                <div>
                  <dt>Request ID</dt>
                  <dd>{selectedRequest.requestId || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Notification State</dt>
                  <dd>{formatStatus(selectedRequest.status)}</dd>
                </div>
                <div>
                  <dt>Decision Time</dt>
                  <dd>{selectedRequest.decidedAt ? formatDate(selectedRequest.decidedAt) : 'Waiting for review'}</dd>
                </div>
                <div>
                  <dt>Professor Note</dt>
                  <dd>{selectedRequest.note || 'No note recorded'}</dd>
                </div>
              </dl>

              <div className="mail-actions">
                {selectedRequest?.groupId && (
                  <Link className="workspace-button workspace-button-primary" to={`/groups/${selectedRequest.groupId}`}>
                    Open Group
                  </Link>
                )}

                {canDecide && (
                  <>
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
                  </>
                )}
              </div>

              {!canDecide && selectedRequest?.requestStatus !== 'PENDING' && (
                <p className="mail-state" aria-live="polite">
                  This request has already been {formatStatus(selectedRequest.requestStatus).toLowerCase()}.
                </p>
              )}
            </>
          ) : (
            <p className="mail-detail-empty">Select a request to review its details.</p>
          )}
        </section>
      </section>

      <section className="mail-inbox-shell professor-transfer-panel">
        <div className="mail-sidebar-header">
          <p className="mailbox-title">Group Transfer Notifications</p>
          <p className="mailbox-count">{transferNotifications.length} notifications</p>
        </div>

        {loadingTransfers && (
          <p className="mail-state" aria-live="polite">Loading group transfer notifications...</p>
        )}

        {!loadingTransfers && transferLoadError && (
          <p className="mail-state mail-state-error" aria-live="polite">{transferLoadError}</p>
        )}

        {!loadingTransfers && !transferLoadError && transferNotifications.length === 0 && (
          <p className="mail-state" aria-live="polite">No transfer notifications yet.</p>
        )}

        {!loadingTransfers && !transferLoadError && transferNotifications.length > 0 && (
          <section className="professor-transfer-list" aria-label="Group transfer notification list">
            {transferNotifications.map((entry) => (
              <article key={entry.id} className="mail-card professor-transfer-card">
                <div className="mail-detail-header">
                  <div>
                    <span className="mail-topic">Transfer</span>
                    <h2 className="mail-subject">{buildTransferSubject(entry)}</h2>
                  </div>
                  <span className="mail-time">{formatDate(entry.createdAt)}</span>
                </div>
                <p className="mail-preview">{buildTransferPreview(entry)}</p>
                <div className="mail-actions">
                  {!entry.isRead && (
                    <button type="button" onClick={() => markNotificationAsRead('group-transfer', entry.id)}>
                      Mark as read
                    </button>
                  )}
                  {entry.groupId && (
                    <Link className="workspace-button workspace-button-secondary" to={`/groups/${entry.groupId}`}>
                      Open Group
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
