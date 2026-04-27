import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGroupFormation } from './hooks/useGroupFormation';
import apiClient from './services/apiClient';

const initialFeedback = {
  type: '',
  title: '',
  message: '',
};

export default function StudentGroupShellPage() {
  const {
    createGroupShell,
    pending,
    dispatchInvites,
    invitesPending,
  } = useGroupFormation();
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMaxMembers, setNewGroupMaxMembers] = useState(4);
  const [renameGroupName, setRenameGroupName] = useState('');
  const [editGroupMaxMembers, setEditGroupMaxMembers] = useState(4);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteIds, setInviteIds] = useState([]);
  const [selectedInviteIds, setSelectedInviteIds] = useState([]);
  const [selectedKickMemberId, setSelectedKickMemberId] = useState('');
  const [manageFeedback, setManageFeedback] = useState(initialFeedback);

  const selectedGroup = groups.find((item) => String(item.groupId) === String(selectedGroupId)) || null;
  const selectedIsLeader = selectedGroup?.membershipRole === 'LEADER';
  const leaderManagedGroups = groups.filter((item) => item.membershipRole === 'LEADER');
  const advisorRequestEligibleGroups = leaderManagedGroups.filter((item) => !item.advisor?.id);

  const memberRows = (() => {
    if (!selectedGroup) {
      return [];
    }

    const rows = [];
    if (selectedGroup.leader) {
      rows.push({
        id: selectedGroup.leader.id,
        fullName: selectedGroup.leader.fullName,
        studentId: selectedGroup.leader.studentId,
        role: 'Leader',
      });
    }

    const existing = new Set(rows.map((item) => String(item.id)));
    (selectedGroup.members || []).forEach((member) => {
      if (existing.has(String(member.id))) {
        return;
      }

      rows.push({
        id: member.id,
        fullName: member.fullName,
        studentId: member.studentId,
        role: 'Member',
      });
    });

    return rows;
  })();

  const kickableMembers = (() => {
    if (!selectedGroup) {
      return [];
    }

    const leaderId = String(selectedGroup.leader?.id || selectedGroup.leaderId || '');
    return (selectedGroup.members || []).filter((member) => String(member.id) !== leaderId);
  })();

  const currentMemberCount = memberRows.length;
  const availableInviteSlots = selectedGroup ? Math.max(Number(selectedGroup.maxMembers || 0) - currentMemberCount, 0) : 0;
  const selectedGroupIsFull = Boolean(selectedGroup) && availableInviteSlots === 0;

  function showFeedback(type, title, message) {
    setManageFeedback({ type, title, message });
  }

  async function loadGroupDirectory() {
    setGroupsLoading(true);

    try {
      const { data: payload } = await apiClient.get('/v1/groups');
      const rows = payload.data || [];
      setGroups(rows);
      setSelectedGroupId((current) => {
        if (current && rows.some((item) => String(item.groupId) === String(current))) {
          return current;
        }
        return rows[0]?.groupId || '';
      });
    } catch (loadError) {
      setGroups([]);
      setSelectedGroupId('');
      showFeedback('error', 'Groups unavailable', loadError.response?.data?.message || loadError.message || 'Could not load groups.');
    } finally {
      setGroupsLoading(false);
    }
  }

  useEffect(() => {
    loadGroupDirectory();
    // load once on mount; repeated re-fetches can collapse expanded group rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRenameGroupName(selectedGroup?.groupName || '');
    setEditGroupMaxMembers(selectedGroup?.maxMembers || 4);
    setInviteIds([]);
    setSelectedInviteIds([]);
    const leaderId = String(selectedGroup?.leader?.id || selectedGroup?.leaderId || '');
    const firstKickable = (selectedGroup?.members || []).find((member) => String(member.id) !== leaderId);
    setSelectedKickMemberId(firstKickable ? String(firstKickable.id) : '');
  }, [selectedGroup]);

  async function handleSubmit(event) {
    event.preventDefault();
    setManageFeedback(initialFeedback);

    try {
      await createGroupShell(newGroupName, newGroupMaxMembers);
      setNewGroupName('');
      setNewGroupMaxMembers(4);
      setShowAddGroupModal(false);
      await loadGroupDirectory();
      showFeedback('success', 'Group created', 'Your new group shell is ready.');
    } catch (createError) {
      showFeedback('error', 'Create failed', createError.response?.data?.message || createError.message || 'Failed to create group.');
    }
  }

  async function updateSelectedGroup(payload, successTitle, successMessage) {
    if (!selectedGroup || !selectedIsLeader) {
      return;
    }

    setManageFeedback(initialFeedback);

    try {
      await apiClient.patch(`/v1/groups/${selectedGroup.groupId}`, payload);
      await loadGroupDirectory();
      showFeedback('success', successTitle, successMessage);
    } catch (updateError) {
      showFeedback('error', 'Update failed', updateError.response?.data?.message || updateError.message || 'Failed to update group.');
    }
  }

  async function handleChangeGroupName() {
    const nextName = renameGroupName.trim();
    if (!nextName) {
      showFeedback('error', 'Invalid group name', 'Group name is required.');
      return;
    }

    await updateSelectedGroup({ groupName: nextName }, 'Group renamed', `Group name updated to "${nextName}".`);
  }

  async function handleChangeMaxMembers() {
    const nextMax = Number(editGroupMaxMembers);
    if (!Number.isInteger(nextMax) || nextMax < 1 || nextMax > 10) {
      showFeedback('error', 'Invalid max members', 'Max members must be between 1 and 10.');
      return;
    }

    await updateSelectedGroup(
      { maxMembers: nextMax },
      'Capacity updated',
      `Group capacity is now ${nextMax} member${nextMax === 1 ? '' : 's'}.`,
    );
  }

  async function handleDeleteSelectedGroup() {
    if (!selectedGroup || !selectedIsLeader) {
      return;
    }

    const confirmed = window.confirm(`Delete group "${selectedGroup.groupName}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setManageFeedback(initialFeedback);

    try {
      await apiClient.delete(`/v1/groups/${selectedGroup.groupId}`);
      await loadGroupDirectory();
      showFeedback('success', 'Group deleted', `"${selectedGroup.groupName}" was removed.`);
    } catch (deleteError) {
      showFeedback('error', 'Delete failed', deleteError.response?.data?.message || deleteError.message || 'Failed to delete group.');
    }
  }

  async function handleLeaveSelectedGroup() {
    if (!selectedGroup || selectedIsLeader) {
      return;
    }

    setManageFeedback(initialFeedback);

    try {
      await apiClient.post(`/v1/groups/${selectedGroup.groupId}/leave`);
      await loadGroupDirectory();
      showFeedback('success', 'Left group', 'You have left the selected group.');
    } catch (leaveError) {
      showFeedback('error', 'Leave failed', leaveError.response?.data?.message || leaveError.message || 'Failed to leave group.');
    }
  }

  function addInviteId() {
    const id = inviteInput.trim();
    if (!/^\d{11}$/.test(id)) {
      showFeedback('error', 'Invalid student ID', 'Student ID must be exactly 11 digits.');
      return;
    }

    if (inviteIds.includes(id)) {
      showFeedback('error', 'Already queued', 'This student ID is already queued.');
      return;
    }

    if (selectedGroupIsFull) {
      showFeedback('warning', 'Group is full', 'This group is already at full capacity.');
      return;
    }

    if (inviteIds.length >= availableInviteSlots) {
      showFeedback(
        'warning',
        'No invite slots left',
        `Only ${availableInviteSlots} slot${availableInviteSlots === 1 ? '' : 's'} available for new members.`,
      );
      return;
    }

    setInviteIds((prev) => [...prev, id]);
    setSelectedInviteIds((prev) => [...prev, id]);
    setInviteInput('');
    setManageFeedback(initialFeedback);
  }

  function removeSelectedInviteIds() {
    if (selectedInviteIds.length === 0) {
      return;
    }

    const selectedSet = new Set(selectedInviteIds);
    setInviteIds((prev) => prev.filter((item) => !selectedSet.has(item)));
    setSelectedInviteIds([]);
  }

  async function handleSendInvites() {
    if (!selectedGroup || !selectedIsLeader) {
      return;
    }

    if (inviteIds.length === 0) {
      showFeedback('error', 'Invite list empty', 'Add at least one student ID to invite.');
      return;
    }

    if (selectedGroupIsFull) {
      showFeedback('warning', 'Group is full', 'This group is already at full capacity.');
      return;
    }

    if (inviteIds.length > availableInviteSlots) {
      showFeedback(
        'warning',
        'Invite limit exceeded',
        `Only ${availableInviteSlots} slot${availableInviteSlots === 1 ? '' : 's'} available for new members.`,
      );
      return;
    }

    setManageFeedback(initialFeedback);

    try {
      const result = await dispatchInvites(selectedGroup.groupId, inviteIds);
      const createdCount = Array.isArray(result) ? result.length : inviteIds.length;
      setInviteIds([]);
      setSelectedInviteIds([]);
      setInviteInput('');
      showFeedback(
        'success',
        'Invites sent',
        `${createdCount} invitation${createdCount === 1 ? '' : 's'} sent successfully.`,
      );
    } catch (inviteError) {
      showFeedback('error', 'Invite failed', inviteError.response?.data?.message || inviteError.message || 'Failed to send invites.');
    }
  }

  async function handleKickMember() {
    if (!selectedGroup || !selectedIsLeader) {
      return;
    }

    if (!selectedKickMemberId) {
      showFeedback('error', 'No member selected', 'Select a member to kick.');
      return;
    }

    const confirmed = window.confirm('Remove this student from the group?');
    if (!confirmed) {
      return;
    }

    setManageFeedback(initialFeedback);

    try {
      await apiClient.post(`/v1/groups/${selectedGroup.groupId}/members/${selectedKickMemberId}/kick`);
      await loadGroupDirectory();
      setSelectedKickMemberId('');
      showFeedback('success', 'Member removed', 'Selected member was removed from the group.');
    } catch (kickError) {
      showFeedback('error', 'Kick failed', kickError.response?.data?.message || kickError.message || 'Failed to remove member.');
    }
  }

  return (
    <main className="page page-create-group">
      <section className="single-panel">
        <section className="form">
          <label className="field">
            <span>Current Group</span>
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              disabled={groupsLoading || groups.length === 0}
            >
              {groups.length === 0 && <option value="">No groups available</option>}
              {groups.map((item) => (
                <option key={item.groupId} value={item.groupId}>
                  {item.groupName} ({item.membershipRole === 'LEADER' ? 'Leader' : 'Member'})
                </option>
              ))}
            </select>
          </label>
        </section>

        <div className="invite-form-actions">
          <button type="button" onClick={() => setShowAddGroupModal(true)}>
            Create Group
          </button>
          {advisorRequestEligibleGroups.length > 0 ? (
            <Link to="/team-leader/advisor-requests/new">Request Advisor</Link>
          ) : (
            <span className="workspace-button workspace-button-secondary workspace-button-disabled">
              Request Advisor
            </span>
          )}
        </div>

        {leaderManagedGroups.length === 0 && (
          <div className="feedback feedback-warning" aria-live="polite">
            <div className="feedback-label">restricted</div>
            <h2>Leader action required</h2>
            <p>Only team leaders can submit advisor requests. Create a group first to unlock this flow.</p>
          </div>
        )}

        {selectedGroup && (
          <section className="manage-group-layout">
            <section className="form">
              <h2 className="group-manage-title">{selectedGroup.groupName}</h2>
              <p className="token-note">
                Members {currentMemberCount} / {selectedGroup.maxMembers}
              </p>

              <div className="group-directory-members">
                {memberRows.map((member) => (
                  <article key={member.id} className="group-member-row">
                    <div>
                      <strong>{member.fullName || member.studentId || 'Student'}</strong>
                      <span>{member.studentId || member.role}</span>
                    </div>

                    <div className="group-member-actions">
                      <span className="member-role-badge">{member.role}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="form">
              {selectedIsLeader && (
                <>
                  <label className="field">
                    <span>Change Group Name</span>
                    <div className="invite-input-row">
                      <input
                        type="text"
                        value={renameGroupName}
                        onChange={(event) => setRenameGroupName(event.target.value)}
                        minLength={1}
                        maxLength={255}
                      />
                      <button type="button" className="invite-add-button" onClick={handleChangeGroupName}>
                        Change Name
                      </button>
                    </div>
                  </label>

                  <label className="field">
                    <span>Change Max Members</span>
                    <div className="invite-input-row">
                      <input
                        type="number"
                        value={editGroupMaxMembers}
                        onChange={(event) => setEditGroupMaxMembers(Number(event.target.value))}
                        min={1}
                        max={10}
                      />
                      <button type="button" className="invite-add-button" onClick={handleChangeMaxMembers}>
                        Change Max
                      </button>
                    </div>
                  </label>

                  <label className="field">
                    <span>Invite Student Number</span>
                    <div className="field-help" role="note">
                      {selectedGroupIsFull
                        ? 'This group is full, so new invites are disabled.'
                        : `${availableInviteSlots} slot${availableInviteSlots === 1 ? '' : 's'} available for new members.`}
                    </div>
                    <div className="invite-input-row">
                      <input
                        type="text"
                        value={inviteInput}
                        onChange={(event) => setInviteInput(event.target.value)}
                        placeholder="11-digit student ID"
                        maxLength={11}
                        disabled={selectedGroupIsFull}
                      />
                      <button type="button" className="invite-add-button" onClick={addInviteId} disabled={selectedGroupIsFull}>
                        Add
                      </button>
                    </div>
                  </label>

                  <label className="field">
                    <span>Invite Users Select</span>
                    <select
                      multiple
                      value={selectedInviteIds}
                      onChange={(event) => {
                        const selected = Array.from(event.target.selectedOptions).map((opt) => opt.value);
                        setSelectedInviteIds(selected);
                      }}
                      size={Math.max(3, Math.min(inviteIds.length, 6))}
                    >
                      {inviteIds.length === 0 && <option value="" disabled>No queued IDs</option>}
                      {inviteIds.map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  </label>

                  <div className="invite-form-actions">
                    <button
                      type="button"
                      onClick={handleSendInvites}
                      disabled={invitesPending || inviteIds.length === 0 || selectedGroupIsFull}
                    >
                      {invitesPending ? 'Sending...' : 'Invite Users'}
                    </button>
                    <button type="button" onClick={removeSelectedInviteIds} disabled={selectedInviteIds.length === 0}>
                      Remove Selected
                    </button>
                  </div>

                  <label className="field">
                    <span>Kick User</span>
                    <div className="invite-input-row">
                      <select
                        value={selectedKickMemberId}
                        onChange={(event) => setSelectedKickMemberId(event.target.value)}
                      >
                        {kickableMembers.length === 0 && <option value="">No members to kick</option>}
                        {kickableMembers.map((member) => (
                          <option key={member.id} value={member.id}>{member.fullName || member.studentId || member.id}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="invite-remove-button"
                        onClick={handleKickMember}
                        disabled={!selectedKickMemberId}
                      >
                        Kick
                      </button>
                    </div>
                  </label>

                  <div className="invite-form-actions">
                    <button type="button" onClick={handleDeleteSelectedGroup}>Delete Group</button>
                  </div>
                </>
              )}

              {!selectedIsLeader && (
                <button type="button" onClick={handleLeaveSelectedGroup}>Leave Group</button>
              )}
            </section>
          </section>
        )}

        {(groupsLoading || manageFeedback.message) && (
          <div
            className={groupsLoading ? 'feedback feedback-loading' : `feedback feedback-${manageFeedback.type || 'idle'}`}
            aria-live="polite"
          >
            <div className="feedback-label">{groupsLoading ? 'loading' : manageFeedback.type || 'info'}</div>
            {!groupsLoading && manageFeedback.title && <h2>{manageFeedback.title}</h2>}
            <p>{groupsLoading ? 'Refreshing groups...' : manageFeedback.message}</p>
          </div>
        )}

        <p className="token-note">
          <Link to="/home">Back to Student Home</Link>
        </p>
      </section>

      {showAddGroupModal && (
        <div className="mail-overlay" role="dialog" aria-modal="true" aria-label="Add group">
          <button type="button" className="mail-overlay-backdrop" onClick={() => setShowAddGroupModal(false)} />
          <section className="mail-drawer">
            <div className="mail-overlay-header">
              <h2>Add Group</h2>
              <button type="button" className="mail-overlay-close" onClick={() => setShowAddGroupModal(false)}>Close</button>
            </div>

            <form className="form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Group Name</span>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  minLength={3}
                  maxLength={64}
                  required
                />
              </label>

              <label className="field">
                <span>Max Members</span>
                <input
                  type="number"
                  value={newGroupMaxMembers}
                  onChange={(event) => setNewGroupMaxMembers(Number(event.target.value))}
                  min={1}
                  max={10}
                  required
                />
              </label>

              <button type="submit" disabled={pending}>{pending ? 'Creating...' : 'Add Group'}</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
