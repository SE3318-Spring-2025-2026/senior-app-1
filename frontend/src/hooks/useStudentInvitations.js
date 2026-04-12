import { useState } from 'react';

// Seeded mock invitations returned by the fetch mock.
// 'error-inv' always triggers a 400 so the error path can be tested without a backend.
const MOCK_INVITATIONS = [
  { id: 'inv-1',     groupId: 'grp-1', groupName: 'AI Capstone Team', status: 'PENDING' },
  { id: 'inv-2',     groupId: 'grp-2', groupName: 'Web Dev Squad',    status: 'PENDING' },
  { id: 'error-inv', groupId: 'grp-3', groupName: 'Error Group',      status: 'PENDING' },
];

// Mock: simulates GET /invitations?studentId=me.
// Replace with apiClient.get('/v1/invitations/me') when the backend is ready.
function mockFetchInvitations() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ data: MOCK_INVITATIONS.map((inv) => ({ ...inv })), status: 200 });
    }, 600);
  });
}

// Mock: simulates PATCH /invitations/{invitationId}/response.
// Replace with apiClient.patch(`/v1/invitations/${invitationId}/response`, { response })
// when the backend is ready.
function mockPatchInvitationResponse(invitationId, response) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (invitationId === 'error-inv') {
        const err = new Error('This invitation has already been responded to.');
        err.response = {
          status: 400,
          data: { message: err.message, code: 'ALREADY_RESPONDED' },
        };
        return reject(err);
      }

      resolve({
        data: { id: invitationId, status: response === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED' },
        status: 200,
      });
    }, 800);
  });
}

function mapResponseError(err) {
  const status = err.response?.status;
  const message = err.response?.data?.message;

  if (status === 400) return message || 'This invitation has already been responded to.';
  if (status === 403) return 'You are not authorised to respond to this invitation.';
  if (status === 404) return 'This invitation no longer exists.';
  return 'Something went wrong. Please try again.';
}

export function useStudentInvitations() {
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const [responseErrors, setResponseErrors] = useState({});

  async function fetchInvitations() {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await mockFetchInvitations();
      setInvitations(result.data);
    } catch {
      setLoadError('Could not load your invitations. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }

  // response: "ACCEPT" | "REJECT"
  async function respondToInvitation(invitationId, response) {
    setRespondingId(invitationId);
    setResponseErrors((prev) => {
      const next = { ...prev };
      delete next[invitationId];
      return next;
    });

    try {
      await mockPatchInvitationResponse(invitationId, response);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err) {
      setResponseErrors((prev) => ({ ...prev, [invitationId]: mapResponseError(err) }));
      throw err;
    } finally {
      setRespondingId(null);
    }
  }

  return {
    loading,
    invitations,
    loadError,
    respondingId,
    responseErrors,
    fetchInvitations,
    respondToInvitation,
  };
}
