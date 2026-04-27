import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const initialForm = {
  email: '',
  fullName: '',
  password: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Coordinator Registration',
  message: 'Create a coordinator account from the admin workspace.',
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
      title: 'Coordinator already exists',
      message: payload.message || 'A user with this email already exists.',
      result: 'Duplicate email',
    };
  }

  if (status === 400) {
    return {
      type: 'warning',
      title: 'Missing information',
      message: payload.message || 'Coordinator email, full name, and password are required.',
      result: 'Validation failed',
    };
  }

  return {
    type: 'error',
    title: 'Coordinator creation failed',
    message: payload.message || 'The coordinator account could not be created.',
    result: 'Failed',
  };
}

export default function AdminCoordinatorCreatePage() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useNotification();

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Creating coordinator',
      message: 'Saving the coordinator account.',
      result: '',
    });

    try {
      const { data: result } = await apiClient.post('/v1/admin/coordinators', form);

      setFeedback({
        type: 'success',
        title: 'Coordinator created',
        message: result.message || 'Coordinator account created successfully.',
        result: result.email || form.email,
      });
      notify({
        type: 'success',
        title: 'Coordinator created',
        message: result.message || 'Coordinator account created successfully.',
      });
      setForm(initialForm);
    } catch (err) {
      if (err.response) {
        setFeedback(mapRegisterError(err.response.data || {}, err.response.status));
      } else {
        setFeedback({
          type: 'error',
          title: 'Request failed',
          message: 'The coordinator creation request could not reach the backend.',
          result: 'Network error',
        });
        notify({
          type: 'error',
          title: 'Coordinator creation failed',
          message: 'The coordinator creation request could not reach the backend.',
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
        <p className="eyebrow">Admin Workspace</p>
        <h1>Add Coordinator</h1>
        <p className="subtitle">
          Create a coordinator account to manage valid student IDs and manual group membership overrides.
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
            <span>Coordinator Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="coordinator@example.edu"
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
              placeholder="Coordinator Jane Doe"
              value={form.fullName}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span>Temporary Password</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating coordinator...' : 'Add Coordinator'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Coordinator Jobs</p>
            <h2>What this role can do</h2>
            <p className="token-copy">
              Coordinators can import valid student IDs and manually add/remove student memberships in groups.
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
