import { useMemo, useState } from 'react';
import { useNotification } from './contexts/NotificationContext';

const initialForm = {
  email: '',
  newPassword: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Create your professor password',
  message: 'Enter your professor email and choose a strong password to activate your account.',
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
  const [form, setForm] = useState(() => ({
    ...initialForm,
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
      message: 'Checking the professor email and saving your new password.',
      result: '',
    });

    try {
      const response = await fetch('/api/v1/professors/password-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email,
          newPassword: form.newPassword,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setFeedback(mapSetupError(result, response.status));
        return;
      }

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
        email: '',
        newPassword: '',
      }));
    } catch (error) {
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
          Newly invited professors activate their account here by entering their professor email and choosing their
          first password.
        </p>
      </section>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Professor Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="prof@example.edu"
              value={form.email}
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
              Enter the same professor email used during account creation, choose a strong password, and submit once.
              Only professor accounts that are still waiting for first-time password setup can be activated here.
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
