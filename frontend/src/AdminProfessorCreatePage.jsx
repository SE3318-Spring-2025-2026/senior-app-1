import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

const initialForm = {
  email: '',
  fullName: '',
  department: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Professor Registration',
  message: 'Create a professor account from the admin workspace.',
  result: '',
};

function mapRegisterError(payload, status) {
  if (status === 401) {
    return {
      type: 'error',
      title: 'Session required',
      message: payload.message || 'Admin session was not found. Sign in again and retry.',
      result: 'Unauthorized',
    };
  }

  if (status === 409) {
    return {
      type: 'warning',
      title: 'Professor already exists',
      message: payload.message || 'A user with this email already exists.',
      result: 'Duplicate email',
    };
  }

  if (status === 400) {
    return {
      type: 'warning',
      title: 'Missing information',
      message: 'Professor email, full name, and department are required.',
      result: 'Validation failed',
    };
  }

  return {
    type: 'error',
    title: 'Professor creation failed',
    message: payload.message || 'The professor account could not be created.',
    result: 'Failed',
  };
}

export default function AdminProfessorCreatePage() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useNotification();

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Creating professor',
      message: 'Saving the professor account and preparing first-time password setup.',
      result: '',
    });

    try {
      const token = window.localStorage.getItem('adminToken') || window.localStorage.getItem('authToken');
      const response = await fetch('/api/v1/admin/professors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) {
        setFeedback(mapRegisterError(result, response.status));
        return;
      }

      setFeedback({
        type: 'success',
        title: 'Professor created',
        message: result.message || 'Professor account created. The professor can now choose a password.',
        result: 'Ready for password setup',
      });
      notify({
        type: 'success',
        title: 'Professor created',
        message: result.message || 'Professor account created successfully.',
      });
      setForm(initialForm);
    } catch {
      setFeedback({
        type: 'error',
        title: 'Request failed',
        message: 'The professor creation request could not reach the backend. Check whether the backend server is running.',
        result: 'Network error',
      });
      notify({
        type: 'error',
        title: 'Professor creation failed',
        message: 'The professor creation request could not reach the backend.',
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
        <p className="eyebrow">Admin Workspace</p>
        <h1>Add Professor</h1>
        <p className="subtitle">
          Create a professor account. The system generates the setup state internally and the professor chooses their
          own password later.
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
            <span>Full Name</span>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Prof. Jane Doe"
              value={form.fullName}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span>Department</span>
            <input
              id="department"
              name="department"
              type="text"
              placeholder="Software Engineering"
              value={form.department}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating professor...' : 'Add Professor'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">How It Works</p>
            <h2>Password is chosen by professor</h2>
            <p className="token-copy">
              The admin only creates the professor account here. A random setup token is handled by the system, and
              the professor sets their own password during the password setup step.
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
