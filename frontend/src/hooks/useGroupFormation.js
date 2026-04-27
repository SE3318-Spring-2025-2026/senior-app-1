import { useState } from 'react';
import apiClient from '../services/apiClient';

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

      const { data: payload } = await apiClient.post('/v1/groups', { groupName, maxMembers });
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
      const { data: payload } = await apiClient.post(`/v1/groups/${groupId}/invitations`, { studentIds });
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

    try {
      const { data: payload } = await apiClient.get('/v1/groups/mine');
      const normalized = normalizeGroup(payload.data || payload);
      setGroup(normalized);
      return normalized;
    } catch (err) {
      if (err.response?.status === 404) {
        setGroup(null);
        return null;
      }
      throw new Error(err.response?.data?.message || err.message || 'Could not load current group.');
    }
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
