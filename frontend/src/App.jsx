import { useEffect, useState } from 'react';
import apiClient from './services/apiClient';
import { mapValidationError } from './services/apiErrors';

const initialForm = {
  studentId: '',
  fullName: '',
  email: '',
  password: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Waiting for input',
  message: 'Submit the registration form or start GitHub linking with an authenticated student token.',
  studentId: '',
  result: '',
  userId: '',
};

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  // The token gate is deliberately temporary: it keeps #24/#25 testable without
  // introducing a full student authentication feature outside the current scope.
  const [studentToken, setStudentToken] = useState('');
  const [linking, setLinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const githubLinkStatus = params.get('githubLink');
    if (!githubLinkStatus) {
      return;
    }

    // Clear any token copy after the callback so the page starts clean on the next use.
    setStudentToken('');
    setLinking(false);

    // The backend already condensed the callback outcome into safe UI params.
    // We render those and then strip them from the visible URL immediately.
    const usedMockOAuth = params.get('mockOAuth') === '1';
    const nextFeedback = githubLinkStatus === 'success'
      ? {
          type: 'success',
          title: 'GitHub linked successfully',
          message: usedMockOAuth
            ? 'GitHub OAuth credentials are not configured in the backend .env file, so this run used the local mock callback flow instead of the real GitHub authorize screen.'
            : `${params.get('githubUsername') || 'your GitHub account'} is now linked to this student account.`,
          studentId: params.get('studentId') || '',
          result: usedMockOAuth ? 'Mock OAuth flow' : 'GitHub linked',
          userId: '',
        }
      : {
          type: params.get('code') === 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT' ? 'warning' : 'error',
          title: params.get('code') === 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT'
            ? 'GitHub already linked'
            : 'GitHub link failed',
          message: params.get('message') || 'GitHub OAuth callback failed.',
          studentId: params.get('studentId') || '',
          result: params.get('code') || 'OAuth error',
          userId: '',
        };

    setFeedback(nextFeedback);

    params.delete('githubLink');
    params.delete('githubUsername');
    params.delete('studentId');
    params.delete('code');
    params.delete('message');
    params.delete('mockOAuth');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Creating student account',
      message: 'The form is being validated and the student account is being created.',
      studentId: '',
      result: '',
      userId: '',
    });

    try {
      const response = await apiClient.post('/v1/students/register', form, { auth: false });
      const result = response.data;
      setFeedback({
        type: 'success',
        title: 'Student registered',
        message: result.message || 'Student account created successfully',
        studentId: result.studentId || form.studentId,
        result: result.valid ? 'Created' : 'Unknown',
        userId: result.userId || '',
      });
      setForm(initialForm);
    } catch (error) {
      if (error.status) {
        const mapped = mapValidationError(error.data || {});
        setFeedback({
          type: mapped.type,
          title: mapped.title,
          message: error.data?.message || 'Validation failed',
          studentId: form.studentId,
          result: mapped.result,
          userId: '',
        });
        return;
      }

      setFeedback({
        type: 'error',
        title: 'Request failed',
        message: 'The registration request could not reach the backend. Check whether the backend server is running.',
        studentId: form.studentId,
        result: 'Network error',
        userId: '',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGitHubLink() {
    if (!studentToken.trim()) {
      setFeedback({
        type: 'warning',
        title: 'Student token required',
        message: 'Provide an authenticated student token before starting GitHub linking.',
        studentId: feedback.studentId,
        result: 'Missing token',
        userId: feedback.userId,
      });
      return;
    }

    setLinking(true);
    // This step only requests the authorization URL; the actual linking finishes
    // after GitHub redirects back through the callback endpoint.
    setFeedback({
      type: 'loading',
      title: 'Starting GitHub linking',
      message: 'Requesting the authorization URL from the backend.',
      studentId: feedback.studentId,
      result: '',
      userId: feedback.userId,
    });

    try {
      const response = await apiClient.get('/v1/students/me/github/link', {
        auth: true,
        token: studentToken.trim(),
      });
      const result = response.data;
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      if (error.status) {
        const mapped = mapValidationError(error.data || {});
        setFeedback({
          type: mapped.type,
          title: error.status === 401 || error.status === 403 ? 'Student token required' : mapped.title,
          message: error.data?.message || 'Failed to create the GitHub authorization URL.',
          studentId: feedback.studentId,
          result: error.data?.code || mapped.result,
          userId: feedback.userId,
        });
        setLinking(false);
        return;
      }

      setFeedback({
        type: 'error',
        title: 'GitHub link could not start',
        message: 'The backend could not be reached while starting GitHub OAuth.',
        studentId: feedback.studentId,
        result: 'Network error',
        userId: feedback.userId,
      });
      setLinking(false);
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
        <p className="eyebrow">Senior App</p>
        <h1>Student Registration Validation</h1>
        <p className="subtitle">
          Create a student account, then use the GitHub linking action with an authenticated student token for the OAuth start flow.
        </p>
      </section>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Student ID</span>
            <input
              id="studentId"
              name="studentId"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength="11"
              placeholder="11070001000"
              value={form.studentId}
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
              placeholder="Ali Veli"
              value={form.fullName}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="student@university.edu"
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
              autoComplete="new-password"
              placeholder="StrongPassword123!"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          <button id="submit-button" type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Student Account'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">GitHub Linking</p>
            <h2>Link GitHub</h2>
            <p className="token-copy">
              This action is available only for authenticated active students. Until a full student auth feature exists,
              provide a development token to test the linking flow.
            </p>

            <label className="field">
              <span>Student Token</span>
              <textarea
                id="studentToken"
                name="studentToken"
                placeholder="Paste an authenticated student token"
                spellCheck="false"
                value={studentToken}
                onChange={(event) => setStudentToken(event.target.value)}
                rows="5"
              />
            </label>

            <p className="token-note">
              The token is used only for this session and is cleared after the callback result is processed.
            </p>

            <button type="button" onClick={handleGitHubLink} disabled={!studentToken.trim() || linking}>
              {linking ? 'Redirecting to GitHub...' : 'Link GitHub'}
            </button>
          </section>

          <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
            <p className="feedback-label">Current Status</p>
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
            {(feedback.studentId || feedback.result || feedback.userId) && (
              <dl className="feedback-meta">
                <div>
                  <dt>Student ID</dt>
                  <dd>{feedback.studentId || '-'}</dd>
                </div>
                <div>
                  <dt>User ID</dt>
                  <dd>{feedback.userId || '-'}</dd>
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
