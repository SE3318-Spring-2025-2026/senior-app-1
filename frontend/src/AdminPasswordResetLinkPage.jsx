import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const initialFeedback = {
  type: 'idle',
  title: 'Password Reset',
  message: 'Enter a user ID to generate a one-time password reset link.',
  resetLink: '',
  expiresAt: '',
};

function mapGenerateError(error) {
  const status = error.response?.status;
  const payload = error.response?.data || {};

  if (status === 401) {
    return {
      type: 'error',
      title: 'Session required',
      message: payload.message || 'Admin session was not found. Sign in again and retry.',
      resetLink: '',
      expiresAt: '',
    };
  }

  if (status === 403) {
    return {
      type: 'error',
      title: 'Admin access required',
      message: payload.message || 'Only admins can generate password reset links.',
      resetLink: '',
      expiresAt: '',
    };
  }

  if (status === 404) {
    if (payload.code === 'ROUTE_NOT_FOUND') {
      return {
        type: 'error',
        title: 'API route unavailable',
        message: 'The backend did not recognize the password reset endpoint. Restart the backend server and retry.',
        resetLink: '',
        expiresAt: '',
      };
    }

    return {
      type: 'warning',
      title: 'User not found',
      message: payload.message || 'No user exists with that user ID.',
      resetLink: '',
      expiresAt: '',
    };
  }

  return {
    type: 'error',
    title: 'Link generation failed',
    message: payload.message || 'Password reset link could not be generated.',
    resetLink: '',
    expiresAt: '',
  };
}

export default function AdminPasswordResetLinkPage() {
  const [userId, setUserId] = useState('');
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useNotification();

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedUserId = userId.trim();
    if (!/^[1-9][0-9]*$/.test(normalizedUserId)) {
      setFeedback({
        type: 'warning',
        title: 'Valid user ID required',
        message: 'Enter a positive numeric user ID.',
        resetLink: '',
        expiresAt: '',
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Generating link',
      message: 'Creating a one-time password reset link.',
      resetLink: '',
      expiresAt: '',
    });

    try {
      const { data } = await apiClient.post(`/v1/admin/users/${normalizedUserId}/password-reset-link`, {});
      setFeedback({
        type: 'success',
        title: 'Reset link generated',
        message: data.message || 'Password reset link generated successfully.',
        resetLink: data.resetLink || '',
        expiresAt: data.expiresAt || '',
      });
      notify({
        type: 'success',
        title: 'Reset link generated',
        message: 'The one-time password reset link is ready.',
      });
    } catch (error) {
      setFeedback(mapGenerateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyResetLink() {
    if (!feedback.resetLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(feedback.resetLink);
      notify({
        type: 'success',
        title: 'Link copied',
        message: 'Password reset link copied to clipboard.',
      });
    } catch {
      notify({
        type: 'warning',
        title: 'Copy failed',
        message: 'Select the link text and copy it manually.',
      });
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Admin Workspace</p>
        <h1>Password Reset Link</h1>
        <p className="subtitle">
          Generate a one-time link for a registered user. Existing unused reset links for the same user are revoked.
        </p>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/admin">
          Back to Admin Tools
        </Link>
      </p>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>User ID</span>
            <input
              id="userId"
              name="userId"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="42"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Generating link...' : 'Generate Password Reset Link'}
          </button>
        </form>

        <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
          <p className="feedback-label">Current Status</p>
          <h2>{feedback.title}</h2>
          <p>{feedback.message}</p>

          {feedback.resetLink && (
            <dl className="feedback-meta">
              <div>
                <dt>Reset Link</dt>
                <dd>
                  <textarea readOnly value={feedback.resetLink} rows="4" aria-label="Generated reset link" />
                </dd>
              </div>
              {feedback.expiresAt && (
                <div>
                  <dt>Expires</dt>
                  <dd>{new Date(feedback.expiresAt).toLocaleString()}</dd>
                </div>
              )}
              <div>
                <dt>Action</dt>
                <dd>
                  <button type="button" onClick={copyResetLink}>
                    Copy Link
                  </button>
                </dd>
              </div>
            </dl>
          )}
        </section>
      </section>
    </main>
  );
}
