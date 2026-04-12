import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import { useStudentInvitations } from './hooks/useStudentInvitations';

const LS_KEY = 'invite_notifications';

function InvitationCard({ invitation, respondingId, responseErrors, onRespond }) {
  const isResponding = respondingId === invitation.id;
  const error = responseErrors[invitation.id];

  return (
    <article className="stat-card">
      <h3>{invitation.groupName}</h3>
      <p>
        <span>Status: </span>
        <strong>{invitation.status}</strong>
      </p>

      <div className="form-actions">
        <button
          type="button"
          disabled={isResponding}
          onClick={() => onRespond(invitation.id, 'ACCEPT')}
        >
          {isResponding ? 'Accepting...' : 'Accept'}
        </button>
        <button
          type="button"
          disabled={isResponding}
          onClick={() => onRespond(invitation.id, 'REJECT')}
        >
          {isResponding ? 'Declining...' : 'Decline'}
        </button>
      </div>

      {error && (
        <p className="field-error" role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </article>
  );
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

  const [lastResolved, setLastResolved] = useState(null);

  useEffect(() => {
    fetchInvitations();

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const entries = JSON.parse(raw);
        entries.forEach((entry) => {
          notify({
            type: 'info',
            title: 'New Invitation Received!',
            message: `You have been invited to join ${entry.groupName}. See your pending invitations below.`,
          });
        });
        localStorage.removeItem(LS_KEY);
      }
    } catch {
      // Ignore malformed localStorage data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRespond(invitationId, response) {
    const invitation = invitations.find((inv) => inv.id === invitationId);

    try {
      await respondToInvitation(invitationId, response);

      setLastResolved({ groupName: invitation?.groupName, response });

      // ─── Notify Team Leader (fire-and-forget, confirmed backend success) ───
      if (response === 'ACCEPT') {
        // Backend already triggers NotificationService.notifyMembershipAccepted.
        // Here we show a UI confirmation to the student with a link to the group.
        notify({
          type: 'success',
          title: 'Team Leader Notified',
          message: (
            <span>
              The Team Leader of{' '}
              <Link to={`/groups/${invitation?.groupId}`}>
                {invitation?.groupName}
              </Link>{' '}
              has been notified of your membership.
            </span>
          ),
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
      setLastResolved(null);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Student Workspace</p>
        <h1>My Invitations</h1>
        <p className="subtitle">
          Review your pending group invitations below. Accept to join a group or decline to pass.
        </p>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/">
          Back to Home
        </Link>
      </p>

      {lastResolved && (
        <section className="panel">
          <section className="feedback feedback-success" aria-live="polite">
            <p className="feedback-label">
              {lastResolved.response === 'ACCEPT' ? 'Invitation Accepted' : 'Invitation Declined'}
            </p>
            <p>
              {lastResolved.response === 'ACCEPT'
                ? `You have joined ${lastResolved.groupName}.`
                : `You have declined the invitation from ${lastResolved.groupName}.`}
            </p>
          </section>
        </section>
      )}

      <section className="panel">
        {loading && (
          <section className="feedback feedback-loading" aria-live="polite">
            <p className="feedback-label">Loading</p>
            <p>Loading invitations...</p>
          </section>
        )}

        {!loading && loadError && (
          <section className="feedback feedback-error" aria-live="polite">
            <p className="feedback-label">Error</p>
            <p>{loadError}</p>
          </section>
        )}

        {!loading && !loadError && invitations.length === 0 && (
          <section className="feedback feedback-idle" aria-live="polite">
            <p className="feedback-label">No Invitations</p>
            <p>You have no pending invitations.</p>
          </section>
        )}

        {!loading && invitations.length > 0 && (
          <div className="stats-grid">
            {invitations.map((inv) => (
              <InvitationCard
                key={inv.id}
                invitation={inv}
                respondingId={respondingId}
                responseErrors={responseErrors}
                onRespond={handleRespond}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}