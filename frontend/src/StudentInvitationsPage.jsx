import { useEffect, useState } from 'react';
import { useNotification } from './contexts/NotificationContext';
import { useStudentInvitations } from './hooks/useStudentInvitations';

function getGroupLabel(entry) {
  const raw = entry.groupName || entry.payload?.groupName || '';
  if (!raw) {
    return '';
  }

  // Hide UUID-like values from UI and keep labels readable.
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidLike.test(raw)) {
    return '';
  }

  return raw;
}

function formatSubject(entry) {
  const groupLabel = getGroupLabel(entry);

  if (entry.type === 'PENDING_INVITE') {
    return groupLabel ? `Invitation to join ${groupLabel}` : 'Invitation to join a team';
  }
  if (entry.type === 'GROUP_INVITE') {
    return groupLabel ? `Team invitation: ${groupLabel}` : 'Team invitation received';
  }
  if (entry.type === 'GROUP_MEMBERSHIP_ACCEPTED') {
    return groupLabel ? `Membership update: ${groupLabel}` : 'Membership update';
  }
  return 'New notification';
}

function formatPreview(entry) {
  const groupLabel = getGroupLabel(entry);

  if (entry.type === 'PENDING_INVITE') {
    return groupLabel
      ? `You were invited to join ${groupLabel}. Accept or decline from your inbox.`
      : 'You can accept or decline this invitation from your inbox.';
  }
  if (entry.type === 'GROUP_INVITE') {
    return groupLabel
      ? `A team leader sent you an invitation for ${groupLabel}.`
      : 'A team leader sent you an invitation.';
  }
  if (entry.type === 'GROUP_MEMBERSHIP_ACCEPTED') {
    return groupLabel
      ? `Your membership update for ${groupLabel} has been delivered.`
      : 'A membership acceptance update was delivered.';
  }
  if (entry.type === 'ADVISOR_TRANSFER') {
    const advisorName = entry.newAdvisor?.fullName || entry.payload?.newAdvisorName || 'the new advisor';
    const advisorEmail = entry.newAdvisor?.email || entry.payload?.newAdvisorEmail || '';
    return groupLabel
      ? `${groupLabel} is now assigned to ${advisorName}${advisorEmail ? ` (${advisorEmail})` : ''}.`
      : `Your group is now assigned to ${advisorName}${advisorEmail ? ` (${advisorEmail})` : ''}.`;
  }
  if (entry.type === 'ADVISOR_DECISION') {
    const decision = String(entry.advisorDecision || entry.payload?.advisorDecision || '').toUpperCase();
    return groupLabel
      ? `Advisor request for ${groupLabel} was ${decision === 'APPROVED' ? 'approved' : 'rejected'}.`
      : `Your advisor request was ${decision === 'APPROVED' ? 'approved' : 'rejected'}.`;
  }
  if (entry.type === 'ADVISOR_RELEASE') {
    const advisorName = entry.previousAdvisor?.fullName || entry.payload?.previousAdvisorName || 'the previous advisor';
    return groupLabel
      ? `${advisorName} is no longer assigned to ${groupLabel}.`
      : `${advisorName} is no longer assigned to your group.`;
  }
  return 'Notification received from local mailbox.';
}

function formatAdvisorTransferSubject(entry) {
  const groupLabel = getGroupLabel(entry);
  return groupLabel ? `Advisor transfer: ${groupLabel}` : 'Advisor transfer update';
}

function formatAdvisorTransferPreview(entry) {
  const advisorName = entry.newAdvisor?.fullName || entry.payload?.newAdvisorName || 'a new advisor';
  const advisorEmail = entry.newAdvisor?.email || entry.payload?.newAdvisorEmail || '';
  const groupLabel = getGroupLabel(entry);
  return groupLabel
    ? `${groupLabel} has been transferred to ${advisorName}${advisorEmail ? ` (${advisorEmail})` : ''}.`
    : `Your group has been transferred to ${advisorName}${advisorEmail ? ` (${advisorEmail})` : ''}.`;
}

function formatAdvisorDecisionSubject(entry) {
  const groupLabel = getGroupLabel(entry);
  const decision = String(entry.advisorDecision || entry.payload?.advisorDecision || '').toUpperCase();
  const decisionLabel = decision === 'APPROVED' ? 'Approved' : 'Rejected';
  return groupLabel ? `${decisionLabel}: ${groupLabel}` : `Advisor request ${decisionLabel.toLowerCase()}`;
}

function formatAdvisorDecisionPreview(entry) {
  const groupLabel = getGroupLabel(entry);
  const decision = String(entry.advisorDecision || entry.payload?.advisorDecision || '').toUpperCase();
  return groupLabel
    ? `${groupLabel} advisor request was ${decision === 'APPROVED' ? 'approved' : 'rejected'}.`
    : `Your advisor request was ${decision === 'APPROVED' ? 'approved' : 'rejected'}.`;
}

function formatAdvisorReleaseSubject(entry) {
  const groupLabel = getGroupLabel(entry);
  return groupLabel ? `Advisor released: ${groupLabel}` : 'Advisor release update';
}

function formatAdvisorReleasePreview(entry) {
  const advisorName = entry.previousAdvisor?.fullName || entry.payload?.previousAdvisorName || 'the previous advisor';
  const groupLabel = getGroupLabel(entry);
  return groupLabel
    ? `${advisorName} left ${groupLabel}.`
    : `${advisorName} left your group.`;
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

export default function StudentInvitationsPage() {
  const {
    loading,
    invitations,
    loadError,
    respondingId,
    responseErrors,
    fetchInvitations,
    respondToInvitation,
  } = useStudentInvitations();

  const { notify } = useNotification();

  const [mailbox, setMailbox] = useState([]);
  const [advisorTransfers, setAdvisorTransfers] = useState([]);
  const [advisorDecisions, setAdvisorDecisions] = useState([]);
  const [advisorReleases, setAdvisorReleases] = useState([]);
  const [selectedMailId, setSelectedMailId] = useState(null);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [transferLoadError, setTransferLoadError] = useState('');
  const [loadingDecisions, setLoadingDecisions] = useState(true);
  const [decisionLoadError, setDecisionLoadError] = useState('');
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [releaseLoadError, setReleaseLoadError] = useState('');

  useEffect(() => {
    fetchInvitations();

    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
    fetch('/api/v1/notifications/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return;
        }

        const rows = payload.notifications || [];
        setMailbox(rows);
      })
      .catch(() => {
        setMailbox([]);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId;
    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');

    async function loadAdvisorTransfers() {
      try {
        const response = await fetch('/api/v1/team-leader/notifications/advisor-transfers', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json().catch(() => []);
        if (!active) {
          return;
        }

        if (!response.ok) {
          setTransferLoadError('Advisor transfer notifications could not be loaded.');
          setAdvisorTransfers([]);
        } else {
          const rows = Array.isArray(payload) ? payload : payload.notifications || [];
          setAdvisorTransfers(rows);
          setTransferLoadError('');
        }
      } catch {
        if (!active) {
          return;
        }

        setTransferLoadError('Advisor transfer notifications could not be loaded.');
        setAdvisorTransfers([]);
      } finally {
        if (!active) {
          return;
        }

        setLoadingTransfers(false);
        timeoutId = window.setTimeout(loadAdvisorTransfers, 15000);
      }
    }

    loadAdvisorTransfers();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId;
    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');

    async function loadAdvisorReleases() {
      try {
        const response = await fetch('/api/v1/team-leader/notifications/advisor-releases', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json().catch(() => []);
        if (!active) {
          return;
        }

        if (!response.ok) {
          setReleaseLoadError('Advisor release notifications could not be loaded.');
          setAdvisorReleases([]);
        } else {
          const rows = Array.isArray(payload) ? payload : payload.notifications || [];
          setAdvisorReleases(rows);
          setReleaseLoadError('');
        }
      } catch {
        if (!active) {
          return;
        }

        setReleaseLoadError('Advisor release notifications could not be loaded.');
        setAdvisorReleases([]);
      } finally {
        if (!active) {
          return;
        }

        setLoadingReleases(false);
        timeoutId = window.setTimeout(loadAdvisorReleases, 15000);
      }
    }

    loadAdvisorReleases();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId;
    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');

    async function loadAdvisorDecisions() {
      try {
        const response = await fetch('/api/v1/team-leader/notifications/advisor-decisions', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json().catch(() => []);
        if (!active) {
          return;
        }

        if (!response.ok) {
          setDecisionLoadError('Advisor decision notifications could not be loaded.');
          setAdvisorDecisions([]);
        } else {
          const rows = Array.isArray(payload) ? payload : payload.notifications || [];
          setAdvisorDecisions(rows);
          setDecisionLoadError('');
        }
      } catch {
        if (!active) {
          return;
        }

        setDecisionLoadError('Advisor decision notifications could not be loaded.');
        setAdvisorDecisions([]);
      } finally {
        if (!active) {
          return;
        }

        setLoadingDecisions(false);
        timeoutId = window.setTimeout(loadAdvisorDecisions, 15000);
      }
    }

    loadAdvisorDecisions();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  async function handleRespond(invitationId, response) {
    const invitation = invitations.find((inv) => inv.id === invitationId);

    try {
      await respondToInvitation(invitationId, response);

      // ─── Notify Team Leader (fire-and-forget, confirmed backend success) ───
      if (response === 'ACCEPT') {
        // Backend already triggers NotificationService.notifyMembershipAccepted.
        // Here we show a UI confirmation to the student with a link to the group.
        notify({
          type: 'success',
          title: 'Team Leader Notified',
          message: `The Team Leader of ${invitation?.groupName || 'the group'} has been notified of your membership.`,
        });
      } else {
        // REJECT — notify student that leader was informed of the decline
        notify({
          type: 'info',
          title: 'Team Leader Notified',
          message: `The Team Leader of ${invitation?.groupName} has been informed that you declined the invitation.`,
        });
      }
      // ─────────────────────────────────────────────────────────────────────

    } catch {
      // Backend failed — do NOT notify. Error already in responseErrors.
    }
  }

  const pendingInviteMails = invitations.map((invitation) => ({
    ...invitation,
    type: 'PENDING_INVITE',
    createdAt: new Date().toISOString(),
  }));

  const allMail = [...pendingInviteMails, ...mailbox].sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });

  const selectedMail = allMail.find((entry) => `${entry.type}-${entry.id}` === selectedMailId) || null;
  const selectedError = selectedMail ? responseErrors[selectedMail.id] : null;
  const selectedIsPendingInvite = selectedMail?.type === 'PENDING_INVITE';
  const selectedIsResponding = selectedIsPendingInvite && respondingId === selectedMail.id;

  return (
    <main className="page page-mailbox">
      <section className="panel">
        <div className="mail-sidebar-header">
          <p className="mailbox-title">Advisor Release Notifications</p>
          <p className="mailbox-count">{advisorReleases.length} notifications</p>
        </div>

        {loadingReleases && (
          <p className="mail-state" aria-live="polite">Loading advisor release notifications...</p>
        )}

        {!loadingReleases && releaseLoadError && (
          <p className="mail-state" aria-live="polite">{releaseLoadError}</p>
        )}

        {!loadingReleases && !releaseLoadError && advisorReleases.length === 0 && (
          <p className="mail-state" aria-live="polite">No advisor release notifications yet.</p>
        )}

        {!loadingReleases && !releaseLoadError && advisorReleases.length > 0 && (
          <section className="mail-nav" aria-label="Advisor release notification list">
            {advisorReleases.map((entry) => (
              <article key={entry.id} className="mail-nav-item">
                <span className="mail-nav-time">{formatDate(entry.createdAt)}</span>
                <span className="mail-nav-subject">{formatAdvisorReleaseSubject(entry)}</span>
                <span className="mail-nav-preview">{formatAdvisorReleasePreview(entry)}</span>
              </article>
            ))}
          </section>
        )}
      </section>

      <section className="panel">
        <div className="mail-sidebar-header">
          <p className="mailbox-title">Advisor Decision Notifications</p>
          <p className="mailbox-count">{advisorDecisions.length} notifications</p>
        </div>

        {loadingDecisions && (
          <p className="mail-state" aria-live="polite">Loading advisor decision notifications...</p>
        )}

        {!loadingDecisions && decisionLoadError && (
          <p className="mail-state" aria-live="polite">{decisionLoadError}</p>
        )}

        {!loadingDecisions && !decisionLoadError && advisorDecisions.length === 0 && (
          <p className="mail-state" aria-live="polite">No advisor decision notifications yet.</p>
        )}

        {!loadingDecisions && !decisionLoadError && advisorDecisions.length > 0 && (
          <section className="mail-nav" aria-label="Advisor decision notification list">
            {advisorDecisions.map((entry) => (
              <article key={entry.id} className="mail-nav-item">
                <span className="mail-nav-time">{formatDate(entry.createdAt)}</span>
                <span className="mail-nav-subject">{formatAdvisorDecisionSubject(entry)}</span>
                <span className="mail-nav-preview">{formatAdvisorDecisionPreview(entry)}</span>
              </article>
            ))}
          </section>
        )}
      </section>

      <section className="panel">
        <div className="mail-sidebar-header">
          <p className="mailbox-title">Advisor Transfer Notifications</p>
          <p className="mailbox-count">{advisorTransfers.length} notifications</p>
        </div>

        {loadingTransfers && (
          <p className="mail-state" aria-live="polite">Loading advisor transfer notifications...</p>
        )}

        {!loadingTransfers && transferLoadError && (
          <p className="mail-state" aria-live="polite">{transferLoadError}</p>
        )}

        {!loadingTransfers && !transferLoadError && advisorTransfers.length === 0 && (
          <p className="mail-state" aria-live="polite">No advisor transfer notifications yet.</p>
        )}

        {!loadingTransfers && !transferLoadError && advisorTransfers.length > 0 && (
          <section className="mail-nav" aria-label="Advisor transfer notification list">
            {advisorTransfers.map((entry) => (
              <article key={entry.id} className="mail-nav-item">
                <span className="mail-nav-time">{formatDate(entry.createdAt)}</span>
                <span className="mail-nav-subject">{formatAdvisorTransferSubject(entry)}</span>
                <span className="mail-nav-preview">{formatAdvisorTransferPreview(entry)}</span>
              </article>
            ))}
          </section>
        )}
      </section>

      <section className="single-panel">
        {loading && (
          <p className="mail-state" aria-live="polite">Loading mail...</p>
        )}

        {!loading && loadError && (
          <p className="mail-state" aria-live="polite">{loadError}</p>
        )}

        {!loading && !loadError && allMail.length === 0 && (
          <p className="mail-state" aria-live="polite">No mail yet.</p>
        )}

        {!loading && allMail.length > 0 && (
          <div className="mail-layout">
            <aside className="mail-sidebar" aria-label="Mailbox items">
              <div className="mail-sidebar-header">
                <p className="mailbox-title">Inbox</p>
                <p className="mailbox-count">{allMail.length} messages</p>
              </div>

              <section className="mail-nav">
                {allMail.map((entry) => {
                  const key = `${entry.type}-${entry.id}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      className="mail-nav-item"
                      onClick={() => setSelectedMailId(key)}
                    >
                      <span className="mail-nav-time">{formatDate(entry.createdAt)}</span>
                      <span className="mail-nav-subject">{formatSubject(entry)}</span>
                      <span className="mail-nav-preview">{formatPreview(entry)}</span>
                    </button>
                  );
                })}
              </section>
            </aside>
          </div>
        )}
      </section>

      {selectedMail && (
        <div className="mail-overlay" role="dialog" aria-modal="true" aria-label="Mail details">
          <button
            type="button"
            className="mail-overlay-backdrop"
            aria-label="Close mail details"
            onClick={() => setSelectedMailId(null)}
          />

          <section className="mail-drawer">
            <div className="mail-overlay-header">
              <h2>{formatSubject(selectedMail)}</h2>
              <button type="button" className="mail-overlay-close" onClick={() => setSelectedMailId(null)}>
                Close
              </button>
            </div>

            <p className="mail-preview">{formatPreview(selectedMail)}</p>

            <dl className="mail-detail-grid">
              <div>
                <dt>Time</dt>
                <dd>{formatDate(selectedMail.createdAt)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selectedMail.status || 'PENDING'}</dd>
              </div>
              <div>
                <dt>Group</dt>
                <dd>{getGroupLabel(selectedMail) || 'Not specified'}</dd>
              </div>
            </dl>

            {selectedIsPendingInvite && (
              <div className="mail-actions">
                <button
                  type="button"
                  disabled={selectedIsResponding}
                  onClick={() => handleRespond(selectedMail.id, 'ACCEPT')}
                >
                  {selectedIsResponding ? 'Accepting...' : 'Accept'}
                </button>
                <button
                  type="button"
                  disabled={selectedIsResponding}
                  onClick={() => handleRespond(selectedMail.id, 'REJECT')}
                >
                  {selectedIsResponding ? 'Declining...' : 'Decline'}
                </button>
              </div>
            )}

            {selectedError && (
              <p className="field-error" role="alert" aria-live="polite">
                {selectedError}
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
