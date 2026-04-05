import { useState } from 'react';

const initialForm = {
  email: '',
  fullName: '',
  department: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Ready to create a professor account',
  message: 'Enter the professor information and submit it to the admin registration endpoint.',
  userId: '',
  professorId: '',
  result: '',
};

function mapProfessorError(payload, status) {
  if (status === 401 || status === 403) {
    return {
      type: 'error',
      title: 'Admin session required',
      message: payload.message || 'You need an authenticated admin session to register professor accounts.',
      result: 'Unauthorized',
    };
  }

  if (status === 409) {
    return {
      type: 'warning',
      title: 'Email already in use',
      message: payload.message || 'A user with this email already exists.',
      result: 'Duplicate email',
    };
  }

  if (status === 400) {
    return {
      type: 'error',
      title: 'Validation failed',
      message: payload.message || 'Check the entered values and try again.',
      result: 'Invalid input',
    };
  }

  return {
    type: 'error',
    title: 'Professor registration failed',
    message: payload.message || 'The professor account could not be created.',
    result: 'Failed',
  };
}

function getStoredAdminToken() {
  const tokenKeys = ['adminToken', 'authToken', 'token', 'jwt', 'accessToken'];
  const storageList = [window.localStorage, window.sessionStorage];

  for (const storage of storageList) {
    for (const key of tokenKeys) {
      const value = storage.getItem(key);
      if (value?.trim()) {
        return value.trim();
      }
    }
  }

  return '';
}

export default function AdminProfessorRegistrationPage() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const adminToken = getStoredAdminToken();

    if (!adminToken.trim()) {
      setFeedback({
        type: 'error',
        title: 'Admin session required',
        message: 'No stored admin session was found. Sign in as an admin first so the token can be sent automatically.',
        userId: '',
        professorId: '',
        result: 'Unauthorized',
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Creating professor account',
      message: 'Submitting the professor base account information to the backend.',
      userId: '',
      professorId: '',
      result: '',
    });

    try {
      const response = await fetch('/api/v1/admin/professors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken.trim()}`,
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (response.ok) {
        setFeedback({
          type: 'success',
          title: 'Professor account created',
          message: result.message || 'Professor account created. Password setup link generated.',
          userId: result.userId || '',
          professorId: result.professorId || '',
          result: 'Created',
        });
        setForm(initialForm);
        return;
      }

      const mappedError = mapProfessorError(result, response.status);
      setFeedback({
        ...mappedError,
        userId: '',
        professorId: '',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Request failed',
        message: 'The admin registration request could not reach the backend. Check whether the backend server is running.',
        userId: '',
        professorId: '',
        result: 'Network error',
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
        <p className="eyebrow">Senior App Admin</p>
        <h1>Professor Registration</h1>
        <p className="subtitle">
          Create professor base accounts with the admin-only registration flow defined in the registration API.
        </p>
      </section>

      <section className="panel">
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
            <span>Full Name</span>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Prof. Dr. X"
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
              autoComplete="organization"
              placeholder="Software Engineering"
              value={form.department}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Professor Account'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Authorization</p>
            <h2>Admin Session</h2>
            <p className="token-copy">
              This page sends the admin bearer token automatically from browser storage. If no active admin session exists,
              the request is blocked and the status card explains that sign-in is required.
            </p>
          </section>

          <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
            <p className="feedback-label">Registration Status</p>
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
            {(feedback.userId || feedback.professorId || feedback.result) && (
              <dl className="feedback-meta">
                <div>
                  <dt>User ID</dt>
                  <dd>{feedback.userId || '-'}</dd>
                </div>
                <div>
                  <dt>Professor ID</dt>
                  <dd>{feedback.professorId || '-'}</dd>
                </div>
                <div>
                  <dt>Result</dt>
                  <dd>{feedback.result || '-'}</dd>
                </div>
              </dl>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
