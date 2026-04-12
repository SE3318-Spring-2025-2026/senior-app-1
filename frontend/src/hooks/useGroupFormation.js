import { useState } from 'react';

// Mock: simulates POST /groups/{groupId}/invitations.
// Replace with apiClient.post(`/v1/groups/${groupId}/invitations`, { studentIds }) when ready.
// Trigger the 400 path by including an ID that is exactly "error_id" or starts with "invalid".
function mockPostInvitations(groupId, studentIds) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
            // ── DUPLICATE_INVITE simulasyonu ──────────────────────────────────
      const duplicates = studentIds.filter((id) => id.toLowerCase().startsWith('dup'));
      if (duplicates.length > 0) {
        const err = new Error('One or more students have already been invited.');
        err.response = {
          status: 409,
          data: {
            message: err.message,
            code: 'DUPLICATE_INVITE',          // ← backend'in döndüğü kod
            duplicates,
          },
        };
        return reject(err);
      }

      const failures = studentIds
        .filter((id) => id === 'error_id' || id.toLowerCase().startsWith('invalid'))
        .map((id) => ({ studentId: id, reason: 'Student not found or is ineligible.' }));

      if (failures.length > 0) {
        const err = new Error('Some student IDs failed validation.');
        err.response = {
          status: 400,
          data: { message: err.message, code: 'VALIDATION_FAILED', failures },
        };
        return reject(err);
      }

      const invitations = studentIds.map((id) => ({
        id: crypto.randomUUID(),
        groupId,
        studentId: id,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      }));

      resolve({ data: invitations, status: 201 });
    }, 800);
  });
}

// Mock: simulates POST /groups. Replace the body of the try-block with a real
// apiClient.post('/v1/groups', { name }) call once the backend is ready.
function mockPostGroup(name) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const trimmed = name.trim();

      if (!trimmed || trimmed.length < 3 || trimmed.length > 64) {
        const err = new Error('Group name must be between 3 and 64 characters.');
        err.response = {
          status: 400,
          data: { message: err.message, code: 'INVALID_NAME' },
        };
        return reject(err);
      }

      // Simulate a duplicate-name collision when the name starts with "duplicate"
      // so the 400 error path can be exercised without a real backend.
      if (trimmed.toLowerCase().startsWith('duplicate')) {
        const err = new Error('A group with this name already exists.');
        err.response = {
          status: 400,
          data: { message: err.message, code: 'DUPLICATE_NAME' },
        };
        return reject(err);
      }

      resolve({
        data: {
          id: crypto.randomUUID(),
          name: trimmed,
          leaderId: 'mock-leader-id',
          memberIds: [],
          advisorId: null,
        },
        status: 201,
      });
    }, 800);
  });
}

export function useGroupFormation() {
  const [pending, setPending] = useState(false);
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);

  const [invitesPending, setInvitesPending] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [inviteError, setInviteError] = useState(null);

  async function createGroupShell(name) {
    setPending(true);
    setError(null);

    try {
      const result = await mockPostGroup(name);
      setGroup(result.data);
      return result.data;
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message;

      if (status === 400) {
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
      const result = await mockPostInvitations(groupId, studentIds);
      setInvitations((prev) => [...prev, ...result.data]);
      return result.data;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 400) {
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
  };
}
