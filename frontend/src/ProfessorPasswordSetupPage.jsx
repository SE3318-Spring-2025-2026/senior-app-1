import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const initialForm = {
  setupToken: '',
  newPassword: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Create your professor password',
  message: 'Enter your setup token and choose a strong password to activate your account.',
  result: '',
};

function mapSetupError(payload, status) {
  if (status === 404) {
    return {
      type: 'error',
      title: 'Professor setup not found',
      message: payload.message || 'No pending professor password setup was found for this email.',
      result: 'Setup not found',
    };
  }

  if (status === 409) {
    return {
      type: 'warning',
      title: 'Setup already completed',
      message: payload.message || 'This professor account has already completed its one-time password setup.',
      result: 'Already completed',
    };
  }

  if (status === 422) {
    return {
      type: 'warning',
      title: 'Weak password',
      message: payload.message || 'Choose a stronger password and try again.',
      result: 'Password policy failed',
    };
  }

  if (status === 400) {
    return {
      type: 'error',
      title: 'Missing information',
      message: payload.message || 'Professor email and new password are required.',
      result: 'Validation failed',
    };
  }

  return {
    type: 'error',
    title: 'Password setup failed',
    message: payload.message || 'The initial password could not be set.',
    result: 'Failed',
  };
}

export default function ProfessorPasswordSetupPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const [form, setForm] = useState(() => ({
    ...initialForm,
    setupToken: tokenFromUrl,
  }));
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useNotification();

  const passwordHint = useMemo(
    () => 'Use at least 8 characters with uppercase, lowercase, a number, and a special character.',
    [],
  );

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Setting your password',
      message: 'Validating setup token and saving your new password.',
      result: '',
    });

    try {
      const { data: result } = await apiClient.post('/v1/professors/password-setup', {
        setupToken: form.setupToken,
        newPassword: form.newPassword,
      });

      setFeedback({
        type: 'success',
        title: 'Password set successfully',
        message: result.message || 'Your professor account is now active and ready for login.',
        result: 'Account activated',
      });
      notify({
        type: 'success',
        title: 'Professor password saved',
        message: result.message || 'Your professor account is now active.',
      });
      setForm((current) => ({
        ...current,
        setupToken: tokenFromUrl,
        newPassword: '',
      }));
    } catch (error) {
      if (error.response) {
        setFeedback(mapSetupError(error.response.data || {}, error.response.status));
        return;
      }
      setFeedback({
        type: 'error',
        title: 'Request failed',
        message: 'The password setup request could not reach the backend. Check whether the backend server is running.',
        result: 'Network error',
      });
      notify({
        type: 'error',
        title: 'Password setup failed',
        message: 'The password setup request could not reach the backend.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Professor Access</p>
        <h1>Professor Initial Password Setup</h1>
        <p className="subtitle">
          Newly invited professors activate their account by using the setup token generated during admin registration.
        </p>
      </section>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Setup Token</span>
            <input
              id="setupToken"
              name="setupToken"
              type="text"
              placeholder="pst_xxx"
              value={form.setupToken}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span>New Password</span>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={form.newPassword}
              onChange={handleChange}
              required
            />
          </label>

          <p className="token-note">{passwordHint}</p>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving password...' : 'Set Password'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">How It Works</p>
            <h2>First-time professor access</h2>
            <p className="token-copy">
              Enter the setup token from admin registration, choose a strong password, and submit once.
              Tokens are one-time use and expire automatically.
            </p>
          </section>

          <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
            <p className="feedback-label">Current Status</p>
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
            {feedback.result && (
              <dl className="feedback-meta">
                <div>
                  <dt>Result</dt>
                  <dd>{feedback.result}</dd>
                </div>
              </dl>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
