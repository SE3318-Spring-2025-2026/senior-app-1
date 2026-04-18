import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

const initialForm = {
  email: 'admin@example.com',
  password: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Admin Sign In',
  message: 'Enter your admin email and password to continue to the admin workspace.',
};

function mapLoginError(payload, status) {
  if (status === 401) {
    return {
      type: 'error',
      title: 'Login failed',
      message: payload.message || 'Invalid admin email or password.',
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
    message: payload.message || 'Admin login could not be completed.',
  };
}

export default function AdminLoginPage() {
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
      message: 'Checking your admin credentials.',
    });

    try {
      const response = await fetch('/api/v1/admin/login', {
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

      window.localStorage.setItem('adminToken', result.token);
      window.localStorage.setItem('authToken', result.token);
      window.localStorage.setItem('adminUser', JSON.stringify(result.user || {}));

      setFeedback({
        type: 'success',
        title: 'Signed in successfully',
        message: result.message || 'Admin login successful. Redirecting to home.',
      });
      notify({
        type: 'success',
        title: 'Admin signed in',
        message: result.message || 'Admin login successful.',
      });

      window.setTimeout(() => {
        navigate('/home');
      }, 500);
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Request failed',
        message: 'The admin login request could not reach the backend. Check whether the backend server is running.',
      });
      notify({
        type: 'error',
        title: 'Admin login failed',
        message: 'The admin login request could not reach the backend.',
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
        <p className="eyebrow">Admin Access</p>
        <h1>Admin Login</h1>
        <p className="subtitle">
          Sign in with your admin account. The session token is stored automatically and then reused by admin-only
          screens such as professor registration.
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
              placeholder="Enter admin password"
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
