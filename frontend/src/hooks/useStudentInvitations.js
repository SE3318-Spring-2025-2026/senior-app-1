import { useState } from 'react';
import apiClient from '../services/apiClient';

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
      const { data: payload } = await apiClient.get('/v1/invitations/me');
      setInvitations(payload.invitations || []);
    } catch (error) {
      setLoadError(error.response?.data?.message || error.message || 'Could not load your invitations. Please refresh and try again.');
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
      await apiClient.patch(`/v1/invitations/${invitationId}/response`, { response });
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
