import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGroupFormation } from './hooks/useGroupFormation';

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
  const [manageError, setManageError] = useState('');

  const selectedGroup = groups.find((item) => String(item.groupId) === String(selectedGroupId)) || null;
  const selectedIsLeader = selectedGroup?.membershipRole === 'LEADER';

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

  async function loadGroupDirectory() {
    setGroupsLoading(true);

    try {
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const response = await fetch('/api/v1/groups', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Could not load groups.');
      }

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
    const firstKickable = (selectedGroup?.members || [])[0];
    setSelectedKickMemberId(firstKickable ? String(firstKickable.id) : '');
  }, [selectedGroup]);

  async function handleSubmit(event) {
    event.preventDefault();
    setManageError('');

    try {
      await createGroupShell(newGroupName, newGroupMaxMembers);
      setNewGroupName('');
      setNewGroupMaxMembers(4);
      setShowAddGroupModal(false);
      await loadGroupDirectory();
    } catch (createError) {
      setManageError(createError.response?.data?.message || createError.message || 'Failed to create group.');
    }
  }

  async function updateSelectedGroup(payload) {
    if (!selectedGroup || !selectedIsLeader) {
      return;
    }

    setManageError('');

    try {
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const response = await fetch(`/api/v1/groups/${selectedGroup.groupId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Failed to rename group.');
      }

      await loadGroupDirectory();
    } catch (renameError) {
      setManageError(renameError.message || 'Failed to rename group.');
    }
  }

  async function handleChangeGroupName() {
    const nextName = renameGroupName.trim();
    if (!nextName) {
      setManageError('Group name is required.');
      return;
    }

    await updateSelectedGroup({ groupName: nextName });
  }

  async function handleChangeMaxMembers() {
    const nextMax = Number(editGroupMaxMembers);
    if (!Number.isInteger(nextMax) || nextMax < 1 || nextMax > 10) {
      setManageError('Max members must be between 1 and 10.');
      return;
    }

    await updateSelectedGroup({ maxMembers: nextMax });
  }

  async function handleDeleteSelectedGroup() {
    if (!selectedGroup || !selectedIsLeader) {
      return;
    }

    const confirmed = window.confirm(`Delete group "${selectedGroup.groupName}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setManageError('');

    try {
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const response = await fetch(`/api/v1/groups/${selectedGroup.groupId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Failed to delete group.');
      }

      await loadGroupDirectory();
    } catch (deleteError) {
      setManageError(deleteError.message || 'Failed to delete group.');
    }
  }

  async function handleLeaveSelectedGroup() {
    if (!selectedGroup || selectedIsLeader) {
      return;
    }

    setManageError('');

    try {
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const response = await fetch(`/api/v1/groups/${selectedGroup.groupId}/leave`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Failed to leave group.');
      }

      await loadGroupDirectory();
    } catch (leaveError) {
      setManageError(leaveError.message || 'Failed to leave group.');
    }
  }

  function addInviteId() {
    const id = inviteInput.trim();
    if (!/^\d{11}$/.test(id)) {
      setManageError('Student ID must be exactly 11 digits.');
      return;
    }

    if (inviteIds.includes(id)) {
      setManageError('This student ID is already queued.');
      return;
    }

    setInviteIds((prev) => [...prev, id]);
    setSelectedInviteIds((prev) => [...prev, id]);
    setInviteInput('');
    setManageError('');
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
      setManageError('Add at least one student ID to invite.');
      return;
    }

    setManageError('');

    try {
      await dispatchInvites(selectedGroup.groupId, inviteIds);
      setInviteIds([]);
      setSelectedInviteIds([]);
      setInviteInput('');
    } catch (inviteError) {
      setManageError(inviteError.response?.data?.message || inviteError.message || 'Failed to send invites.');
    }
  }

  async function handleKickMember() {
    if (!selectedGroup || !selectedIsLeader) {
      return;
    }

    if (!selectedKickMemberId) {
      setManageError('Select a member to kick.');
      return;
    }

    const confirmed = window.confirm('Remove this student from the group?');
    if (!confirmed) {
      return;
    }

    setManageError('');

    try {
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const response = await fetch(`/api/v1/groups/${selectedGroup.groupId}/members/${selectedKickMemberId}/kick`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Failed to remove member.');
      }

      await loadGroupDirectory();
      setSelectedKickMemberId('');
    } catch (kickError) {
      setManageError(kickError.message || 'Failed to remove member.');
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

        {selectedGroup && (
          <section className="manage-group-layout">
            <section className="form">
            <h2 className="group-manage-title">{selectedGroup.groupName}</h2>
            <p className="token-note">Members</p>

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
                      <button type="button" className="invite-add-button" onClick={handleChangeGroupName}>Change Name</button>
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
                      <button type="button" className="invite-add-button" onClick={handleChangeMaxMembers}>Change Max</button>
                    </div>
                  </label>

                  <label className="field">
                    <span>Invite Student Number</span>
                    <div className="invite-input-row">
                      <input
                        type="text"
                        value={inviteInput}
                        onChange={(event) => setInviteInput(event.target.value)}
                        placeholder="11-digit student ID"
                        maxLength={11}
                      />
                      <button type="button" className="invite-add-button" onClick={addInviteId}>Add</button>
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
                    <button type="button" onClick={handleSendInvites} disabled={invitesPending || inviteIds.length === 0}>
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
                        {!selectedGroup.members?.length && <option value="">No members to kick</option>}
                        {(selectedGroup.members || []).map((member) => (
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
                    <button type="button" onClick={() => setShowAddGroupModal(true)}>Add Group</button>
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

        {(manageError || groupsLoading) && (
          <p className="token-note">
            {groupsLoading ? 'Refreshing groups...' : manageError}
          </p>
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
