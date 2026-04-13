import { useState } from 'react';

export function useGroupFormation() {
  const [pending, setPending] = useState(false);
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);

  const [invitesPending, setInvitesPending] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [inviteError, setInviteError] = useState(null);

  function normalizeGroup(data) {
    return {
      id: data.groupId || data.id || null,
      name: data.groupName || data.name || '',
      leaderId: data.leaderId || null,
      maxMembers: data.maxMembers || 4,
      members: data.members || data.memberIds || [],
      status: data.status || 'FORMATION',
    };
  }

  async function createGroupShell(name, maxMembers = 4) {
    setPending(true);
    setError(null);

    try {
      const groupName = name.trim();
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');

      if (!token) {
        const authError = new Error('You must sign in as a student before creating a group.');
        authError.response = { status: 401, data: { message: authError.message } };
        throw authError;
      }

      const response = await fetch('/api/v1/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          groupName,
          maxMembers,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const requestError = new Error(payload.message || 'Failed to create group.');
        requestError.response = {
          status: response.status,
          data: payload,
        };
        throw requestError;
      }

      const data = payload.data || payload;
      const normalized = normalizeGroup({ ...data, groupName, maxMembers });

      setGroup(normalized);
      return normalized;
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message;

      if (status === 400 || status === 401 || status === 403 || status === 409) {
        setError({ type: 'validation', message });
      } else {
        setError({ type: 'unexpected', message: 'Something went wrong. Please try again.' });
      }
      throw err;
    } finally {
      setPending(false);
    }
  }

  // Simulates POST /groups/{groupId}/invitations.
  // studentIds must be a de-duped, trimmed string[].
  async function dispatchInvites(groupId, studentIds) {
    setInvitesPending(true);
    setInviteError(null);

    try {
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const response = await fetch(`/api/v1/groups/${groupId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ studentIds }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(payload.message || 'Invitation dispatch failed.');
        err.response = {
          status: response.status,
          data: payload,
        };
        throw err;
      }

      const created = payload.created || [];
      setInvitations((prev) => [...prev, ...created]);
      return created;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 400 || status === 409) {
        setInviteError({
          type: 'validation',
          message: data?.message || 'Validation failed.',
          failures: data?.failures ?? [],
        });
      } else {
        setInviteError({ type: 'unexpected', message: 'Something went wrong. Please try again.' });
      }
      throw err;
    } finally {
      setInvitesPending(false);
    }
  }

  function reset() {
    setGroup(null);
    setError(null);
    setInvitations([]);
    setInviteError(null);
  }

  async function loadMyGroup() {
    const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
    if (!token) {
      return null;
    }

    const response = await fetch('/api/v1/groups/mine', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      setGroup(null);
      return null;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || 'Could not load current group.');
    }

    const normalized = normalizeGroup(payload.data || payload);
    setGroup(normalized);
    return normalized;
  }

  return {
    createGroupShell,
    pending,
    group,
    error,
    reset,
    dispatchInvites,
    invitesPending,
    invitations,
    inviteError,
    loadMyGroup,
  };
}
