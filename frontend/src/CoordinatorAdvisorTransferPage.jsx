import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

const initialFeedback = {
  type: 'idle',
  title: 'Ready',
  message: 'Select a group and choose the advisor you want to assign.',
};

function normalizeGroups(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function normalizeAdvisors(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

export default function CoordinatorAdvisorTransferPage() {
  const [groups, setGroups] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedAdvisorId, setSelectedAdvisorId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
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
      message: 'Please sign in before opening advisor transfer.',
    });
    navigate('/coordinator/login', { replace: true });
  }, [navigate, notify, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    async function loadTransferData() {
      setLoading(true);
      try {
        const [groupsResponse, advisorsResponse] = await Promise.all([
          fetch('/api/v1/coordinator/groups', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/v1/coordinator/advisors', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const groupsPayload = await groupsResponse.json().catch(() => ({}));
        const advisorsPayload = await advisorsResponse.json().catch(() => ({}));

        if (!groupsResponse.ok) {
          throw new Error(groupsPayload.message || 'Could not load coordinator groups.');
        }

        if (!advisorsResponse.ok) {
          throw new Error(advisorsPayload.message || 'Could not load advisor list.');
        }

        const nextGroups = normalizeGroups(groupsPayload);
        const nextAdvisors = normalizeAdvisors(advisorsPayload);

        setGroups(nextGroups);
        setAdvisors(nextAdvisors);
        setSelectedGroupId((current) => {
          if (current && nextGroups.some((group) => String(group.groupId) === String(current))) {
            return current;
          }
          return nextGroups[0]?.groupId || '';
        });
      } catch (error) {
        setGroups([]);
        setAdvisors([]);
        setSelectedGroupId('');
        setFeedback({
          type: 'error',
          title: 'Load failed',
          message: error.message || 'Could not load transfer data.',
        });
      } finally {
        setLoading(false);
      }
    }

    loadTransferData();
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

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedAdvisorId('');
      return;
    }

    setSelectedAdvisorId((current) => {
      if (current && advisors.some((advisor) => String(advisor.id) === String(current))) {
        return current;
      }
      return '';
    });
  }, [advisors, selectedGroup]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedGroupId || !selectedAdvisorId) {
      setFeedback({
        type: 'warning',
        title: 'Selection required',
        message: 'Please select both a group and a target advisor.',
      });
      return;
    }

    if (String(selectedGroup?.advisor?.id || '') === String(selectedAdvisorId)) {
      const message = 'The selected group is already assigned to this advisor.';
      setFeedback({
        type: 'warning',
        title: 'Same advisor selected',
        message,
      });
      notify({
        type: 'warning',
        title: 'Transfer rejected',
        message,
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Applying transfer',
      message: 'Updating advisor assignment for the selected group.',
    });

    try {
      const response = await fetch(`/api/v1/coordinator/groups/${selectedGroupId}/advisor-transfer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newAdvisorId: Number(selectedAdvisorId),
          reason: reason.trim() || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Advisor transfer failed.');
      }

      const advisor = advisors.find((entry) => String(entry.id) === String(selectedAdvisorId)) || null;
      setGroups((current) => current.map((group) => (
        String(group.groupId) === String(selectedGroupId)
          ? {
            ...group,
            advisor: advisor
              ? {
                id: advisor.id,
                fullName: advisor.fullName,
                email: advisor.email,
                department: advisor.department || null,
              }
              : group.advisor,
          }
          : group
      )));

      setFeedback({
        type: 'success',
        title: 'Advisor transferred',
        message: 'The selected group now shows the updated advisor assignment.',
      });
      notify({
        type: 'success',
        title: 'Transfer completed',
        message: 'Advisor assignment updated successfully.',
      });
      setReason('');
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Transfer failed',
        message: error.message || 'Advisor transfer failed.',
      });
      notify({
        type: 'error',
        title: 'Transfer failed',
        message: error.message || 'Advisor transfer failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Coordinator Workspace</p>
        <h1>Transfer Group Advisor</h1>
        <p className="subtitle">
          Move a group from its current advisor to another active advisor without leaving the coordinator workspace.
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
              disabled={loading || groups.length === 0}
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
            <span>Target Advisor</span>
            <select
              value={selectedAdvisorId}
              onChange={(event) => setSelectedAdvisorId(event.target.value)}
              disabled={loading || advisors.length === 0}
              required
            >
              <option value="">{advisors.length === 0 ? 'No advisors found' : 'Select an advisor'}</option>
              {advisors.map((advisor) => (
                <option key={advisor.id} value={advisor.id}>
                  {advisor.fullName || advisor.email}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder="Optional transfer reason"
            />
          </label>

          <button type="submit" disabled={submitting || loading || groups.length === 0 || advisors.length === 0}>
            {submitting ? 'Applying...' : 'Apply Advisor Transfer'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Selected Group</p>
            <h2>{selectedGroup?.groupName || 'No Group Selected'}</h2>
            <p className="token-copy">
              Current Advisor: {selectedGroup?.advisor?.fullName || selectedGroup?.advisor?.email || 'Unassigned'}
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
