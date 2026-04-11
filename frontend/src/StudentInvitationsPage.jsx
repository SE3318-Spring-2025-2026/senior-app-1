import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStudentInvitations } from './hooks/useStudentInvitations';

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

  // Transient success banner shown after each resolved invitation.
  const [lastResolved, setLastResolved] = useState(null);

  useEffect(() => {
    fetchInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRespond(invitationId, response) {
    const invitation = invitations.find((inv) => inv.id === invitationId);

    try {
      await respondToInvitation(invitationId, response);
      setLastResolved({ groupName: invitation?.groupName, response });
    } catch {
      // error already in responseErrors; keep the banner clear
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
