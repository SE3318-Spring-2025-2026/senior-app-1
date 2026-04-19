import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

const ROLE_CONFIG = {
  ADMIN: {
    tokenKey: 'adminToken',
    loginPath: '/admin/login',
    homePath: '/admin',
    eyebrow: 'Admin Workspace',
    title: 'Delete Group Records',
    subtitle: 'Delete orphan groups from the group database when they no longer have an assigned advisor.',
    backLabel: 'Back to Admin Workspace',
  },
  COORDINATOR: {
    tokenKey: 'coordinatorToken',
    loginPath: '/coordinator/login',
    homePath: '/coordinator',
    eyebrow: 'Coordinator Workspace',
    title: 'Delete Group Records',
    subtitle: 'Clean up orphan groups from the group database after advisor removal or abandoned group formation.',
    backLabel: 'Back to Coordinator Workspace',
  },
};

const initialFeedback = {
  type: 'idle',
  title: 'Ready',
  message: 'Select a group to review whether it can be removed from the group database.',
};

function normalizeGroups(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

export default function GroupCleanupPage({ role = 'COORDINATOR' }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.COORDINATOR;
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(initialFeedback);

  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem(config.tokenKey) || '';

  useEffect(() => {
    if (token) {
      return;
    }

    notify({
      type: 'warning',
      title: `${role === 'ADMIN' ? 'Admin' : 'Coordinator'} login required`,
      message: 'Please sign in before opening group cleanup.',
    });
    navigate(config.loginPath, { replace: true });
  }, [config.loginPath, navigate, notify, role, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    async function fetchGroups() {
      setLoadingGroups(true);
      try {
        const response = await fetch('/api/v1/groups', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || 'Could not load group data.');
        }

        const rows = normalizeGroups(payload);
        setGroups(rows);
        setSelectedGroupId((current) => {
          if (current && rows.some((item) => String(item.groupId) === String(current))) {
            return current;
          }
          return rows[0]?.groupId || '';
        });
        setFeedback(initialFeedback);
      } catch (error) {
        setGroups([]);
        setSelectedGroupId('');
        setFeedback({
          type: 'error',
          title: 'Load failed',
          message: error.message || 'Could not load group data.',
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

  const hasAdvisor = Boolean(selectedGroup?.advisor?.id);
  const totalMembers = (selectedGroup?.members || []).length;

  async function handleDelete() {
    if (!selectedGroup) {
      return;
    }

    if (hasAdvisor) {
      const message = 'This group still has an active advisor assignment and cannot be deleted.';
      setFeedback({
        type: 'warning',
        title: 'Advisor still assigned',
        message,
      });
      notify({
        type: 'warning',
        title: 'Delete blocked',
        message,
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedGroup.groupName} from the group database? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Deleting group',
      message: `Removing ${selectedGroup.groupName} from the group database...`,
    });

    try {
      const response = await fetch(`/api/v1/group-database/groups/${selectedGroup.groupId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Group deletion failed.');
      }

      const nextGroups = groups.filter((group) => String(group.groupId) !== String(selectedGroup.groupId));
      setGroups(nextGroups);
      setSelectedGroupId(nextGroups[0]?.groupId || '');

      setFeedback({
        type: 'success',
        title: 'Group deleted',
        message: `${selectedGroup.groupName} was removed from the group database successfully.`,
      });
      notify({
        type: 'success',
        title: 'Group deleted',
        message: `${selectedGroup.groupName} was removed successfully.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Delete failed',
        message: error.message || 'Group deletion failed.',
      });
      notify({
        type: 'error',
        title: 'Delete failed',
        message: error.message || 'Group deletion failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">{config.eyebrow}</p>
        <h1>{config.title}</h1>
        <p className="subtitle">{config.subtitle}</p>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to={config.homePath}>
          {config.backLabel}
        </Link>
      </p>

      <section className="panel">
        <section className="form">
          <label className="field">
            <span>Group</span>
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              disabled={loadingGroups || groups.length === 0}
            >
              {groups.length === 0 && <option value="">No groups found</option>}
              {groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.groupName}
                </option>
              ))}
            </select>
          </label>

          <div className="cleanup-actions">
            <button
              type="button"
              className="cleanup-delete-button"
              onClick={handleDelete}
              disabled={submitting || loadingGroups || !selectedGroup || hasAdvisor}
            >
              {submitting ? 'Deleting...' : 'Delete Group'}
            </button>
            {hasAdvisor && (
              <p className="group-muted cleanup-hint">
                Delete is disabled while the selected group still has an assigned advisor.
              </p>
            )}
          </div>
        </section>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Selected Group</p>
            <h2>{selectedGroup?.groupName || 'No Group Selected'}</h2>
            <p className="token-copy">Status: {selectedGroup?.status || '-'}</p>
            <p className="token-copy">
              Leader: {selectedGroup?.leader?.fullName || selectedGroup?.leader?.studentId || 'Unknown'}
            </p>
            <p className="token-copy">Members: {selectedGroup ? totalMembers : 0}</p>
            <p className="token-copy">
              Advisor: {selectedGroup?.advisor?.fullName || selectedGroup?.advisor?.email || 'None assigned'}
            </p>
          </section>

          <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
            <p className="feedback-label">Cleanup Status</p>
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
          </section>
        </div>
      </section>
    </main>
  );
}
