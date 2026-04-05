import { useState } from 'react';
import { useNotification } from './contexts/NotificationContext';

const initialForm = {
  studentId: '',
  password: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Student Sign In',
  message: 'Enter your student number and password to sign in.',
};

function mapLoginError(payload, status) {
  if (status === 401) {
    return {
      type: 'error',
      title: 'Login failed',
      message: payload.message || 'Invalid student ID or password.',
    };
  }

  if (status === 403) {
    return {
      type: 'error',
      title: 'Student ID not eligible',
      message: payload.message || 'Only valid student IDs can sign in.',
    };
  }

  if (status === 400) {
    return {
      type: 'warning',
      title: 'Missing information',
      message: payload.message || 'Student ID and password are required.',
    };
  }

  return {
    type: 'error',
    title: 'Request failed',
    message: payload.message || 'Student login could not be completed.',
  };
}

export default function StudentLoginPage() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useNotification();

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Signing in',
      message: 'Checking your student credentials.',
    });

    try {
      const response = await fetch('/api/v1/students/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) {
        const mapped = mapLoginError(result, response.status);
        setFeedback(mapped);
        return;
      }

      window.localStorage.setItem('studentToken', result.token);
      window.localStorage.setItem('authToken', result.token);
      window.localStorage.setItem('studentUser', JSON.stringify(result.user || {}));

      setFeedback({
        type: 'success',
        title: 'Signed in successfully',
        message: result.message || 'Student login successful.',
      });
      notify({
        type: 'success',
        title: 'Student signed in',
        message: result.message || 'Student login successful.',
      });
    } catch {
      setFeedback({
        type: 'error',
        title: 'Request failed',
        message: 'The student login request could not reach the backend. Check whether the backend server is running.',
      });
      notify({
        type: 'error',
        title: 'Student login failed',
        message: 'The student login request could not reach the backend.',
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
        <p className="eyebrow">Student Access</p>
        <h1>Student Login</h1>
        <p className="subtitle">
          Sign in with your 11-digit student number and password. Only students with valid student IDs and active
          accounts can log in.
        </p>
      </section>

      <section className="single-panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Student Number</span>
            <input
              id="studentId"
              name="studentId"
              type="text"
              inputMode="numeric"
              maxLength="11"
              placeholder="11070001000"
              value={form.studentId}
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
