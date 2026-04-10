import { useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';

const LS_KEY = 'invite_notifications';

function parseStudentIds(raw) {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

// InviteMembersSection — rendered once a group shell exists.
// Props:
//   group          — the created group object { id, name, ... }
//   dispatchInvites(groupId, studentIds) — from useGroupFormation
//   invitesPending — boolean
//   invitations    — Invitation[] accumulated from successful dispatches
//   inviteError    — null | { type, message, failures? }
export default function InviteMembersSection({
  group,
  dispatchInvites,
  invitesPending,
  invitations,
  inviteError,
}) {
  const [idsText, setIdsText] = useState('');
  const { notify } = useNotification();

  async function handleSubmit(event) {
    event.preventDefault();
    const ids = parseStudentIds(idsText);
    if (ids.length === 0) return;

    try {
      const dispatched = await dispatchInvites(group.id, ids);
      setIdsText('');

      // Toast: Team Leader sees confirmation
      notify({
        type: 'success',
        title: 'Invitations sent',
        message: `${dispatched.length} invitation(s) dispatched successfully.`,
      });

      // Mock push: write to localStorage so StudentInvitationsPage can drain it
      // and fire "New Invitation Received!" toasts on the student side.
      const existing = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      const newEntries = dispatched.map((inv) => ({
        invitationId: inv.id,
        groupId: inv.groupId,
        groupName: group.name,
        timestamp: new Date().toISOString(),
      }));
      localStorage.setItem(LS_KEY, JSON.stringify([...existing, ...newEntries]));
    } catch (err) {
      // error state managed by hook (keeps textarea); also fire a toast
      const message = err.response?.data?.message || err.message || 'Invitation dispatch failed.';
      notify({ type: 'error', title: 'Invitation failed', message });
    }
  }

  function handleClear() {
    setIdsText('');
  }

  return (
    <section className="panel">
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Invite Student IDs</span>
          <textarea
            id="invite-ids"
            name="studentIds"
            placeholder={'e.g. 11070001001, 11070001002\nor one per line'}
            value={idsText}
            onChange={(e) => setIdsText(e.target.value)}
            rows={4}
            disabled={invitesPending}
            aria-describedby={inviteError ? 'invite-error-summary' : undefined}
          />
          <p className="token-note">
            Enter student IDs separated by commas or newlines. Duplicates are ignored.
            <br />
            <em>Mock tip: include "error_id" or any ID starting with "invalid" to trigger a 400.</em>
          </p>
        </label>

        {inviteError?.type === 'validation' && inviteError.failures?.length > 0 && (
          <section
            id="invite-error-summary"
            className="feedback feedback-error"
            aria-live="polite"
          >
            <p className="feedback-label">Validation Failures</p>
            <p>{inviteError.message}</p>
            <ul>
              {inviteError.failures.map((f) => (
                <li key={f.studentId}>
                  <strong>{f.studentId}</strong> — {f.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {inviteError?.type === 'unexpected' && (
          <section className="feedback feedback-error" aria-live="polite">
            <p className="feedback-label">Error</p>
            <p>{inviteError.message}</p>
          </section>
        )}

        <div className="form-actions">
          <button type="submit" disabled={invitesPending || !idsText.trim()}>
            {invitesPending ? 'Sending invitations...' : 'Send Invitations'}
          </button>
          <button type="button" onClick={handleClear} disabled={invitesPending}>
            Clear
          </button>
        </div>
      </form>

      {invitations.length > 0 && (
        <section className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Pending Invitations</p>
            <ul>
              {invitations.map((inv) => (
                <li key={inv.id}>
                  <strong>{inv.studentId}</strong>
                  <span> — {inv.status}</span>
                </li>
              ))}
            </ul>
          </section>
        </section>
      )}
    </section>
  );
}
