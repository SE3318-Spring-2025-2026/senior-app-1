import { useState } from 'react';

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
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const response = await fetch('/api/v1/invitations/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Could not load invitations.');
      }

      setInvitations(payload.invitations || []);
    } catch (error) {
      setLoadError(error.message || 'Could not load your invitations. Please refresh and try again.');
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
      const token = window.localStorage.getItem('studentToken') || window.localStorage.getItem('authToken');
      const httpResponse = await fetch(`/api/v1/invitations/${invitationId}/response`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ response }),
      });

      const payload = await httpResponse.json().catch(() => ({}));
      if (!httpResponse.ok) {
        const err = new Error(payload.message || 'Failed to update invitation response');
        err.response = { status: httpResponse.status, data: payload };
        throw err;
      }

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
