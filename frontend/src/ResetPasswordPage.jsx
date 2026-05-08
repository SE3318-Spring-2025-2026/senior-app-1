import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from './services/apiClient';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const initialFeedback = {
  type: 'idle',
  title: 'Set New Password',
  message: 'Enter and confirm your new password.',
};

function mapResetError(error) {
  const payload = error.response?.data || {};

  switch (payload.code) {
    case 'RESET_TOKEN_INVALID':
      return {
        type: 'error',
        title: 'Invalid link',
        message: 'This password reset link is invalid. Ask an admin for a new link.',
      };
    case 'RESET_TOKEN_EXPIRED':
      return {
        type: 'error',
        title: 'Link expired',
        message: 'This password reset link has expired. Ask an admin for a new link.',
      };
    case 'RESET_TOKEN_USED':
      return {
        type: 'error',
        title: 'Link already used',
        message: 'This password reset link has already been used.',
      };
    case 'WEAK_PASSWORD':
      return {
        type: 'warning',
        title: 'Weak password',
        message: payload.message || 'Choose a stronger password.',
      };
    default:
      return {
        type: 'error',
        title: 'Password reset failed',
        message: payload.message || 'Password could not be reset.',
      };
  }
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!token) {
      setFeedback({
        type: 'error',
        title: 'Missing token',
        message: 'The password reset link is missing its token.',
      });
      return;
    }

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setFeedback({
        type: 'warning',
        title: 'Weak password',
        message: 'Use at least 8 characters with uppercase, lowercase, number, and special character.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({
        type: 'warning',
        title: 'Passwords do not match',
        message: 'Confirm password must match the new password.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Resetting password',
      message: 'Saving your new password.',
    });

    try {
      const { data } = await apiClient.post('/v1/auth/reset-password', {
        token,
        newPassword,
      });

      setCompleted(true);
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({
        type: 'success',
        title: 'Password reset successful',
        message: data.message || 'Your password has been reset. You can now sign in.',
      });
    } catch (error) {
      setFeedback(mapResetError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Account Recovery</p>
        <h1>Reset Password</h1>
        <p className="subtitle">Use the one-time link from your admin to set a new password.</p>
      </section>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>New Password</span>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={completed}
              required
            />
          </label>

          <label className="field">
            <span>Confirm Password</span>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={completed}
              required
            />
          </label>

          <button type="submit" disabled={submitting || completed}>
            {submitting ? 'Resetting password...' : 'Reset Password'}
          </button>
        </form>

        <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
          <p className="feedback-label">Current Status</p>
          <h2>{feedback.title}</h2>
          <p>{feedback.message}</p>

          {completed && (
            <dl className="feedback-meta">
              <div>
                <dt>Next Step</dt>
                <dd>
                  <Link to="/login">Go to login</Link>
                </dd>
              </div>
            </dl>
          )}
        </section>
      </section>
    </main>
  );
}
