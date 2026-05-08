import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const initialFeedback = {
  type: 'idle',
  title: 'Ready',
  message: 'Select a group and run ADD or REMOVE membership actions.',
};

function normalizeGroups(payload) {
  if (!Array.isArray(payload?.data)) {
    return [];
  }

  return payload.data;
}

export default function CoordinatorGroupMembershipPage() {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [action, setAction] = useState('ADD');
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(initialFeedback);

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
      message: 'Please sign in before opening manual group membership management.',
    });
    navigate('/login', { replace: true });
  }, [navigate, notify, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    async function fetchGroups() {
      setLoadingGroups(true);
      try {
        const { data: payload } = await apiClient.get('/v1/coordinator/groups');
        const rows = normalizeGroups(payload);
        setGroups(rows);
        setSelectedGroupId((current) => {
          if (current && rows.some((item) => String(item.groupId) === String(current))) {
            return current;
          }
          return rows[0]?.groupId || '';
        });
      } catch (error) {
        setGroups([]);
        setSelectedGroupId('');
        setFeedback({
          type: 'error',
          title: 'Load failed',
          message: error.response?.data?.message || error.message || 'Could not load group data.',
        });
      } finally {
        setLoadingGroups(false);
      }
    }

    fetchGroups();
  }, [token]);

  const selectedGroup = useMemo(
    () => groups.find((group) => String(group.groupId) === String(selectedGroupId)) || null,
    [groups, selectedGroupId],
  );

  const totalMembers = useMemo(() => {
    if (!selectedGroup) {
      return 0;
    }

    const participantIds = new Set();
    const leaderId = String(selectedGroup.leader?.id || selectedGroup.leaderId || '');

    if (leaderId) {
      participantIds.add(leaderId);
    }

    (selectedGroup.members || []).forEach((member) => {
      participantIds.add(String(member.id));
    });

    return participantIds.size;
  }, [selectedGroup]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedGroupId) {
      setFeedback({
        type: 'warning',
        title: 'Group required',
        message: 'Please select a group first.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Applying change',
      message: `Running ${action} for student ${studentId.trim() || '-'}...`,
    });

    try {
      const { data: payload } = await apiClient.patch(
        `/v1/coordinator/groups/${selectedGroupId}/membership/coordinator`,
        { action, studentId: studentId.trim() },
      );

      setFeedback({
        type: 'success',
        title: 'Membership updated',
        message: `${action} applied successfully for student ${studentId.trim()}.`,
      });
      notify({
        type: 'success',
        title: 'Coordinator update applied',
        message: `${action} operation completed successfully.`,
      });

      setGroups((current) => current.map((group) => {
        if (String(group.groupId) !== String(selectedGroupId)) {
          return group;
        }

        return {
          ...group,
          members: (payload.memberIds || []).map((id) => ({
            id,
            fullName: 'Student',
            studentId: null,
            email: null,
          })),
        };
      }));
      setStudentId('');
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Update failed',
        message: error.response?.data?.message || error.message || 'Membership update failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Coordinator Workspace</p>
        <h1>Manual Group Membership</h1>
        <p className="subtitle">
          Coordinator override tool for adding or removing students from groups.
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
            <span>Group</span>
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              disabled={loadingGroups || groups.length === 0}
              required
            >
              {groups.length === 0 && <option value="">No groups found</option>}
              {groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.groupName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Action</span>
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="ADD">ADD</option>
              <option value="REMOVE">REMOVE</option>
            </select>
          </label>

          <label className="field">
            <span>Student ID (11 digits)</span>
            <input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              inputMode="numeric"
              maxLength={11}
              placeholder="11070001000"
              required
            />
          </label>

          <button type="submit" disabled={submitting || loadingGroups || groups.length === 0}>
            {submitting ? 'Applying...' : 'Apply Membership Change'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Selected Group</p>
            <h2>{selectedGroup?.groupName || 'No Group Selected'}</h2>
            <p className="token-copy">
              Leader: {selectedGroup?.leader?.fullName || selectedGroup?.leader?.studentId || 'Unknown'}
            </p>
            <p className="token-copy">
              Members: {totalMembers}
            </p>
          </section>

          <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
            <p className="feedback-label">Current Status</p>
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
          </section>
        </div>
      </section>
    </main>
  );
}
