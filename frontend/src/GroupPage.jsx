import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from './services/apiClient';
import { useNotification } from './contexts/NotificationContext';

export default function GroupPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [userStudentId, setUserStudentId] = useState(null);
  const [userAdvisorId, setUserAdvisorId] = useState(null);
  const [error, setError] = useState(null);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [isStudentViewer, setIsStudentViewer] = useState(false);

  const loadGroupData = async () => {
    const response = await apiClient.get(`/v1/groups/${groupId}/membership`);
    return response.data.data;
  };

  useEffect(() => {
    const studentId = window.localStorage.getItem('studentId');
    setUserStudentId(studentId);
    setIsStudentViewer(Boolean(window.localStorage.getItem('studentUser') || studentId));

    try {
      const professorUser = JSON.parse(window.localStorage.getItem('professorUser') || '{}');
      setUserAdvisorId(professorUser?.id ? String(professorUser.id) : null);
    } catch {
      setUserAdvisorId(null);
    }
  }, []);

  useEffect(() => {
    const fetchGroupData = async () => {
      try {
        setLoading(true);
        const data = await loadGroupData();
        setGroup(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching group data:', err);
        setError(err.response?.data?.message || 'Failed to load group');
        notify({
          type: 'error',
          title: 'Failed to load group',
          message: err.response?.data?.message || 'Try again later',
        });
      } finally {
        setLoading(false);
      }
    };

    if (groupId) {
      fetchGroupData();
    }
  }, [groupId, notify]);

  async function confirmAdvisorRelease() {
    setShowReleaseConfirm(false);

    if (!userAdvisorId) {
      notify({
        type: 'error',
        title: 'Not authenticated',
        message: 'Please log in as advisor.',
      });
      return;
    }

    try {
      setReleasing(true);
      const response = await apiClient.patch(`/v1/groups/${groupId}/advisor-release`);
      setGroup((prev) => ({
        ...prev,
        advisorId: null,
        advisor: null,
        status: response.data?.data?.status || 'LOOKING_FOR_ADVISOR',
      }));
      notify({
        type: 'success',
        title: 'Advisor released',
        message: 'You have released your advisor assignment.',
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'Release failed',
        message: err.response?.data?.message || 'Could not release advisor assignment.',
      });
    } finally {
      setReleasing(false);
    }
  }

  async function handleJoinGroup() {
    if (!userStudentId) {
      notify({
        type: 'error',
        title: 'Not authenticated',
        message: 'Please log in first.',
      });
      navigate('/');
      return;
    }

    try {
      setJoining(true);

      await apiClient.post(`/v1/groups/${groupId}/membership/finalize`, {
        studentId: userStudentId,
      });

      const refreshedGroup = await loadGroupData();
      setGroup(refreshedGroup);

      notify({
        type: 'success',
        title: 'Joined group successfully',
        message: `Welcome to ${group?.groupName || 'the group'}.`,
      });
    } catch (err) {
      console.error('Error joining group:', err);

      const errorCode = err.response?.data?.code;
      let errorTitle = 'Failed to join group';
      let errorMessage = 'Please try again.';

      if (errorCode === 'DUPLICATE_MEMBER') {
        errorTitle = 'Already a member';
        errorMessage = 'You are already a member of this group.';
      } else if (errorCode === 'MAX_MEMBERS_REACHED') {
        errorTitle = 'Group is full';
        errorMessage = 'This group has reached maximum capacity.';
      } else if (errorCode === 'GROUP_FINALIZED') {
        errorTitle = 'Group is closed';
        errorMessage = 'This group is no longer accepting members.';
      } else if (errorCode === 'GROUP_NOT_FOUND') {
        errorTitle = 'Group not found';
        errorMessage = 'Unable to find this group.';
      }

      notify({
        type: 'error',
        title: errorTitle,
        message: errorMessage,
      });
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-group-view">
        <div className="feedback feedback-loading">
          <div className="feedback-label">loading</div>
          <h2>Loading group</h2>
          <p>Fetching group details...</p>
        </div>
      </main>
    );
  }

  if (error || !group) {
    return (
      <main className="page page-group-view">
        <div className="feedback feedback-error">
          <div className="feedback-label">error</div>
          <h2>Group not found</h2>
          <p>{error || 'The requested group could not be loaded.'}</p>
        </div>
        <div className="group-action-row">
          <button type="button" onClick={() => navigate('/')}>Back</button>
        </div>
      </main>
    );
  }

  const isAlreadyMember = Boolean(
    userStudentId
    && (group.memberIds || group.members?.map((member) => String(member.id)) || []).includes(String(userStudentId)),
  );
  const isFull = group.currentMemberCount >= group.maxMembers;
  const isFinalized = group.status === 'COMPLETED' || group.status === 'DISBANDED';
  const isAdvisor = userAdvisorId && group.advisorId && String(group.advisorId) === String(userAdvisorId);

  return (
    <main className="page page-group-view">
      <section className="hero group-page-header">
        <p className="eyebrow">Group Workspace</p>
        <h1>{group.groupName || 'Unnamed Group'}</h1>
        <p className="group-page-status">
          Status <strong>{group.status}</strong>
        </p>
      </section>

      <section className="group-details-card">
        <div className="group-details-summary">
          <h3>Group Details</h3>
          <div className="group-summary-grid">
            <div className="group-summary-item">
              <span>Status</span>
              <strong>{group.status}</strong>
            </div>
            <div className="group-summary-item">
              <span>Members</span>
              <strong>{group.currentMemberCount} / {group.maxMembers}</strong>
            </div>
            <div className="group-summary-item">
              <span>Available Slots</span>
              <strong>{group.availableSlots}</strong>
            </div>
            <div className="group-summary-item">
              <span>Advisor</span>
              <strong>
                {group.advisor
                  ? `${group.advisor.fullName || group.advisor.email}${group.advisor.department ? ` (${group.advisor.department})` : ''}`
                  : 'None assigned'}
              </strong>
            </div>
          </div>
        </div>

        <div>
          <h3>Members ({group.currentMemberCount || 0})</h3>
          {group.members && group.members.length > 0 ? (
            <ul className="group-members-list">
              {group.members.map((member, index) => (
                <li key={`${member.id}-${index}`} className="group-member-chip">
                  <span>
                    {member.fullName || member.email || member.studentId || member.id}
                    {member.isLeader ? ' (Leader)' : ''}
                  </span>
                  {String(member.id) === String(userStudentId) && (
                    <span className="group-member-you">(You)</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="group-muted">No members yet.</p>
          )}
        </div>
      </section>

      <section className="group-action-stack">
        {isStudentViewer && isAlreadyMember && (
          <div className="group-callout group-callout-success">
            You are already a member of this group.
          </div>
        )}

        {isStudentViewer && !isAlreadyMember && isFinalized && (
          <div className="group-callout group-callout-error">
            This group is no longer accepting members.
          </div>
        )}

        {isStudentViewer && !isAlreadyMember && !isFinalized && isFull && (
          <div className="group-callout group-callout-warning">
            This group is currently at full capacity.
          </div>
        )}

        <div className="group-action-row">
          {isStudentViewer && !isAlreadyMember && !isFinalized && !isFull && (
            <button type="button" onClick={handleJoinGroup} disabled={joining}>
              {joining ? 'Joining...' : 'Join Group'}
            </button>
          )}

          {isAdvisor && (
            <button
              type="button"
              className="cleanup-delete-button"
              onClick={() => setShowReleaseConfirm(true)}
              disabled={releasing}
            >
              {releasing ? 'Releasing...' : 'Release Advisor Assignment'}
            </button>
          )}

          <button type="button" onClick={() => navigate('/')}>Back</button>
        </div>
      </section>

      {showReleaseConfirm && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Release advisor assignment">
          <button type="button" className="dialog-backdrop" onClick={() => setShowReleaseConfirm(false)} />
          <section className="dialog-card">
            <span className="mail-topic">Advisor Release</span>
            <h2>Confirm release</h2>
            <p>
              Release your advisor assignment from <strong>{group.groupName}</strong>? The group will return to the advisor search state.
            </p>
            <div className="dialog-actions">
              <button type="button" className="cleanup-delete-button" onClick={confirmAdvisorRelease}>
                Yes, Release
              </button>
              <button type="button" onClick={() => setShowReleaseConfirm(false)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
