import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

const initialForm = {
  email: 'coordinator@example.com',
  password: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Coordinator Sign In',
  message: 'Enter your coordinator email and password to continue to the student ID upload workspace.',
};

function mapLoginError(payload, status) {
  if (status === 401) {
    return {
      type: 'error',
      title: 'Login failed',
      message: payload.message || 'Invalid coordinator email or password.',
    };
  }

  if (status === 400) {
    return {
      type: 'warning',
      title: 'Missing information',
      message: payload.message || 'Email and password are required.',
    };
  }

  return {
    type: 'error',
    title: 'Request failed',
    message: payload.message || 'Coordinator login could not be completed.',
  };
}

export default function CoordinatorLoginPage() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { notify } = useNotification();

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Signing in',
      message: 'Checking your coordinator credentials.',
    });

    try {
      const response = await fetch('/api/v1/coordinator/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) {
        setFeedback(mapLoginError(result, response.status));
        return;
      }

      window.localStorage.setItem('coordinatorToken', result.token);
      window.localStorage.setItem('authToken', result.token);
      window.localStorage.setItem('coordinatorUser', JSON.stringify(result.user || {}));

      setFeedback({
        type: 'success',
        title: 'Signed in successfully',
        message: result.message || 'Coordinator login successful. Redirecting to the coordinator workspace.',
      });
      notify({
        type: 'success',
        title: 'Coordinator signed in',
        message: result.message || 'Coordinator login successful.',
      });

      window.setTimeout(() => {
        navigate('/coordinator');
      }, 500);
    } catch {
      setFeedback({
        type: 'error',
        title: 'Request failed',
        message: 'The coordinator login request could not reach the backend. Check whether the backend server is running.',
      });
      notify({
        type: 'error',
        title: 'Coordinator login failed',
        message: 'The coordinator login request could not reach the backend.',
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
        <p className="eyebrow">Coordinator Access</p>
        <h1>Coordinator Login</h1>
        <p className="subtitle">
          Sign in with your coordinator account before opening coordinator workspace tools.
        </p>
      </section>

      <section className="single-panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter coordinator password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
          <p className="feedback-label">Current Status</p>
          <h2>{feedback.title}</h2>
          <p>{feedback.message}</p>
        </section>
      </section>
    </main>
  );
}
