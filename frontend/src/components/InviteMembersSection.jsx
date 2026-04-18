import { useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';

function normalizeStudentId(raw) {
  return String(raw || '').trim();
}

export default function InviteMembersSection({
  group,
  dispatchInvites,
  invitesPending,
  invitations,
  inviteError,
}) {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentIds, setStudentIds] = useState([]);
  const [inputError, setInputError] = useState('');
  const { notify } = useNotification();

  function handleAddStudentId() {
    const normalized = normalizeStudentId(studentIdInput);
    if (!normalized) {
      setInputError('Enter an 11-digit student ID.');
      return;
    }

    if (!/^\d{11}$/.test(normalized)) {
      setInputError('Student ID must be exactly 11 digits.');
      return;
    }

    if (studentIds.includes(normalized)) {
      setInputError('This student ID is already in the invite list.');
      return;
    }

    setStudentIds((prev) => [...prev, normalized]);
    setStudentIdInput('');
    setInputError('');
  }

  function handleRemoveStudentId(id) {
    setStudentIds((prev) => prev.filter((item) => item !== id));
  }

  function handleInputKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddStudentId();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (studentIds.length === 0) {
      setInputError('Add at least one student ID before sending invitations.');
      return;
    }

    try {
      const dispatched = await dispatchInvites(group.id, studentIds);
      setStudentIds([]);
      setStudentIdInput('');
      setInputError('');

      notify({
        type: 'success',
        title: 'Invitations sent',
        message: `${dispatched.length} invitation(s) dispatched successfully.`,
      });
    } catch (err) {
      // ── Duplicate-invite: özel mesaj, textarea KALSIN ──────────────────
      const code = err.response?.data?.code;
      if (code === 'DUPLICATE_INVITE') {
        notify({
          type: 'error',
          title: 'Already invited',
          message:
            err.response?.data?.message ||
            'One or more students have already been invited to this group.',
        });
        // idsText'i temizleme — kullanıcı düzeltip tekrar gönderebilir
        return;
      }
      // ── Diğer hatalar ──────────────────────────────────────────────────
      const message =
        err.response?.data?.message || err.message || 'Invitation dispatch failed.';
      notify({ type: 'error', title: 'Invitation failed', message });
      throw err;
    }
  }

  function handleClear() {
    setStudentIdInput('');
    setStudentIds([]);
    setInputError('');
  }

  return (
    <section className="panel">
      <form className="form" onSubmit={handleSubmit} noValidate>
        <p className="invite-target-group">
          Sending invites to <strong>{group.name}</strong>
        </p>

        <label className="field">
          <span>Invite Student ID</span>
          <div className="invite-input-row">
            <input
              id="invite-student-id"
              name="studentId"
              placeholder="11-digit student ID to invite"
              value={studentIdInput}
              onChange={(e) => {
                setStudentIdInput(e.target.value);
                if (inputError) {
                  setInputError('');
                }
              }}
              onKeyDown={handleInputKeyDown}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={11}
              disabled={invitesPending}
              aria-describedby={inviteError ? 'invite-error-summary' : undefined}
            />
            <button
              type="button"
              className="invite-add-button"
              onClick={handleAddStudentId}
              disabled={invitesPending}
            >
              Add ID
            </button>
          </div>
          <p className="token-note">
            Queue exact 11-digit IDs, then send invitations.
          </p>
        </label>

        {inputError && (
          <p className="field-error" role="alert" aria-live="polite">
            {inputError}
          </p>
        )}

        {studentIds.length > 0 && (
          <section className="invite-list" aria-label="Invited student IDs">
            {studentIds.map((id) => (
              <article key={id} className="invite-list-item">
                <span>{id}</span>
                <button
                  type="button"
                  className="invite-remove-button"
                  onClick={() => handleRemoveStudentId(id)}
                  disabled={invitesPending}
                >
                  Remove
                </button>
              </article>
            ))}
          </section>
        )}

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

        <div className="form-actions invite-form-actions">
          <button type="submit" disabled={invitesPending || studentIds.length === 0}>
            {invitesPending ? 'Sending invitations...' : 'Send Invitations'}
          </button>
          <button type="button" onClick={handleClear} disabled={invitesPending}>
            Clear
          </button>
        </div>
      </form>

      {/* ── Pending Invitations List ─────────────────────────────────────── */}
      {invitations.length > 0 && (
        <section className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Sent Invitations</p>
            <ul>
              {invitations.map((inv) => (
                <li key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                  <strong>{inv.studentId}</strong>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '999px',
                      backgroundColor:
                        inv.status === 'PENDING'   ? '#fff3cd' :
                        inv.status === 'ACCEPTED'  ? '#d4edda' :
                        inv.status === 'REJECTED'  ? '#f8d7da' : '#e9ecef',
                      color:
                        inv.status === 'PENDING'   ? '#856404' :
                        inv.status === 'ACCEPTED'  ? '#155724' :
                        inv.status === 'REJECTED'  ? '#721c24' : '#495057',
                    }}
                  >
                    {inv.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </section>
      )}
    </section>
  );
}