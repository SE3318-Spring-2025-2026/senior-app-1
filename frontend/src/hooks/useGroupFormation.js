import { useState } from 'react';

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

  function reset() {
    setGroup(null);
    setError(null);
  }

  return { createGroupShell, pending, group, error, reset };
}
