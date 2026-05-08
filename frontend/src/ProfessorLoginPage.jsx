import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const initialForm = {
  email: '',
  password: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Professor Sign In',
  message: 'Enter your professor email and password to sign in.',
};

function mapLoginError(payload, status) {
  if (status === 401) {
    return {
      type: 'error',
      title: 'Login failed',
      message: payload.message || 'Invalid professor email or password.',
    };
  }

  if (status === 400) {
    return {
      type: 'warning',
      title: 'Missing information',
      message: payload.message || 'Professor email and password are required.',
    };
  }

  return {
    type: 'error',
    title: 'Request failed',
    message: payload.message || 'Professor login could not be completed.',
  };
}

export default function ProfessorLoginPage() {
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
      message: 'Checking your professor credentials.',
    });

    try {
      const { data: result } = await apiClient.post('/v1/professors/login', form);

      window.localStorage.setItem('professorToken', result.token);
      window.localStorage.setItem('authToken', result.token);
      window.localStorage.setItem('professorUser', JSON.stringify(result.user || {}));

      setFeedback({
        type: 'success',
        title: 'Signed in successfully',
        message: result.message || 'Professor login successful. Redirecting to home.',
      });
      notify({
        type: 'success',
        title: 'Professor signed in',
        message: result.message || 'Professor login successful.',
      });

      window.setTimeout(() => {
        navigate('/home');
      }, 500);
    } catch (err) {
      if (err.response) {
        setFeedback(mapLoginError(err.response.data || {}, err.response.status));
      } else {
        setFeedback({
          type: 'error',
          title: 'Request failed',
          message: 'The professor login request could not reach the backend. Check whether the backend server is running.',
        });
        notify({
          type: 'error',
          title: 'Professor login failed',
          message: 'The professor login request could not reach the backend.',
        });
      }
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
        <h1>Professor Login</h1>
        <p className="subtitle">
          Sign in with the same professor email and password you configured during initial password setup.
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
              placeholder="prof@example.edu"
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
              placeholder="Enter your password"
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
