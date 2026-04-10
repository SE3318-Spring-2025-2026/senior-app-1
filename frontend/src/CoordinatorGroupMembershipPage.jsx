import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useNotification } from './contexts/NotificationContext';

const initialFeedback = {
  type: 'idle',
  title: 'Ready',
  message: 'Enter a group id, student id, and choose add or remove.',
  payloadText: '',
};

function mapMembershipError(payload, status) {
  if (status === 401) {
    return {
      type: 'error',
      title: 'Session required',
      message: payload.message || 'Sign in as coordinator and try again.',
    };
  }
  if (status === 403) {
    return {
      type: 'error',
      title: 'Coordinator only',
      message: payload.message || 'This action requires coordinator credentials.',
    };
  }
  if (status === 404) {
    return {
      type: 'error',
      title: 'Group not found',
      message: payload.message || 'No group exists for that id in D2.',
    };
  }
  if (status === 409) {
    return {
      type: 'warning',
      title: 'Cannot remove leader',
      message:
        payload.message
        || 'Remove or reassign the team leader before removing this member.',
    };
  }
  if (status === 400) {
    return {
      type: 'warning',
      title: 'Invalid request',
      message: payload.message || 'Check action and 11-digit student id.',
    };
  }
  return {
    type: 'error',
    title: 'Update failed',
    message: payload.message || 'Membership could not be updated.',
  };
}

export default function CoordinatorGroupMembershipPage() {
  const [groupId, setGroupId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [action, setAction] = useState('ADD');
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('coordinatorToken') || '';

  useEffect(() => {
    if (token) {
      return;
    }
    notify({
      type: 'warning',
      title: 'Coordinator login required',
      message: 'Please sign in before editing group membership.',
    });
    navigate('/coordinator/login', { replace: true });
  }, [navigate, notify, token]);

  async function handleSubmit(event) {
    event.preventDefault();
    const gid = groupId.trim();
    const sid = studentId.trim();
    if (!gid || !/^[0-9]{11}$/.test(sid)) {
      notify({
        type: 'warning',
        title: 'Check fields',
        message: 'Group id is required and student id must be 11 digits.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      ...initialFeedback,
      type: 'loading',
      title: 'Updating D2',
      message: 'Applying coordinator override with atomic membership write.',
    });

    try {
      const response = await fetch(
        `/api/v1/groups/${encodeURIComponent(gid)}/membership/coordinator`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action, studentId: sid }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        const mapped = mapMembershipError(result, response.status);
        setFeedback({
          ...initialFeedback,
          ...mapped,
          payloadText: '',
        });
        notify({
          type: mapped.type === 'warning' ? 'warning' : 'error',
          title: mapped.title,
          message: mapped.message,
        });
        return;
      }

      const summary = JSON.stringify(
        {
          id: result.id,
          name: result.name,
          leaderId: result.leaderId,
          memberIds: result.memberIds,
        },
        null,
        2,
      );

      setFeedback({
        type: 'success',
        title: 'D2 membership updated',
        message: 'Group record reflects the latest coordinator override.',
        payloadText: summary,
      });
      notify({
        type: 'success',
        title: 'Membership updated',
        message: `${action === 'ADD' ? 'Added' : 'Removed'} student ${sid}.`,
      });
    } catch {
      setFeedback({
        ...initialFeedback,
        type: 'error',
        title: 'Network error',
        message: 'The request could not reach the backend.',
        payloadText: '',
      });
      notify({
        type: 'error',
        title: 'Network error',
        message: 'The membership request could not reach the backend.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Coordinator Workspace</p>
        <h1>Group membership (D2)</h1>
        <p className="subtitle">
          Manual coordinator override for group membership (f15 / f19): add or remove a student by id. Removing the
          team leader is blocked until leadership is reassigned elsewhere.
        </p>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/coordinator">
          Back to Coordinator Workspace
        </Link>
      </p>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Group id</span>
            <input
              id="groupId"
              name="groupId"
              autoComplete="off"
              placeholder="grp-issue-93"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Student id (11 digits)</span>
            <input
              id="studentId"
              name="studentId"
              inputMode="numeric"
              autoComplete="off"
              placeholder="11070001000"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              required
            />
          </label>

          <fieldset className="field field--inline">
            <legend>Action</legend>
            <label className="radio">
              <input
                type="radio"
                name="action"
                value="ADD"
                checked={action === 'ADD'}
                onChange={() => setAction('ADD')}
              />
              ADD
            </label>
            <label className="radio">
              <input
                type="radio"
                name="action"
                value="REMOVE"
                checked={action === 'REMOVE'}
                onChange={() => setAction('REMOVE')}
              />
              REMOVE
            </label>
          </fieldset>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Updating…' : 'Apply to D2'}
          </button>
        </form>

        <div className="side-column">
          <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
            <p className="feedback-label">Result</p>
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
            {feedback.payloadText ? (
              <pre className="membership-preview">{feedback.payloadText}</pre>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
