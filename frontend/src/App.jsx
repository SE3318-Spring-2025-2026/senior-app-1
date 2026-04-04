import { useEffect, useState } from 'react';
import CoordinatorStudentIdUpload from './CoordinatorStudentIdUpload';

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

function mapErrorResponse(payload) {
  switch (payload.code) {
    case 'INVALID_STUDENT_ID':
      return { type: 'error', title: 'Invalid student ID', result: 'Rejected' };
    case 'ALREADY_REGISTERED':
      return { type: 'warning', title: 'Student already registered', result: 'Already exists' };
    case 'DUPLICATE_EMAIL':
      return { type: 'warning', title: 'Email already in use', result: 'Duplicate email' };
    case 'WEAK_PASSWORD':
      return { type: 'error', title: 'Weak password', result: 'Rejected' };
    case 'STUDENT_NOT_ELIGIBLE':
      return { type: 'error', title: 'Student not eligible', result: 'Rejected' };
    case 'GITHUB_ACCOUNT_ALREADY_LINKED_FOR_STUDENT':
      return { type: 'warning', title: 'GitHub already linked', result: 'Already linked' };
    default:
      return { type: 'error', title: 'Validation failed', result: 'Failed' };
  }
}

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [page, setPage] = useState('student'); // 'student' or 'coordinator'
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
      // Registration UI is intentionally a thin client over the backend business rules.
      const response = await fetch('/api/v1/students/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (response.ok) {
        setFeedback({
          type: 'success',
          title: 'Student registered',
          message: result.message || 'Student account created successfully',
          studentId: result.studentId || form.studentId,
          result: result.valid ? 'Created' : 'Unknown',
          userId: result.userId || '',
        });
        setForm(initialForm);
        return;
      }

      const mapped = mapErrorResponse(result);
      setFeedback({
        type: mapped.type,
        title: mapped.title,
        message: result.message || 'Validation failed',
        studentId: form.studentId,
        result: mapped.result,
        userId: '',
      });
    } catch (error) {
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
      const response = await fetch('/api/v1/students/me/github/link', {
        headers: {
          Authorization: `Bearer ${studentToken.trim()}`,
        },
      });
      const result = await response.json();

      if (!response.ok) {
        setFeedback({
          type: 'error',
          title: 'GitHub link could not start',
          message: result.message || 'Failed to create the GitHub authorization URL.',
          studentId: feedback.studentId,
          result: result.code || 'OAuth start failed',
          userId: feedback.userId,
        });
        setLinking(false);
        return;
      }

      window.location.assign(result.authorizationUrl);
    } catch (error) {
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
      <nav style={{ marginBottom: 24 }}>
        <button onClick={() => setPage('student')} style={{ marginRight: 8 }}>
          Student Registration
        </button>
        <button onClick={() => setPage('coordinator')}>
          Coordinator: Valid Student ID Upload
        </button>
      </nav>
      {page === 'student' ? (
        <>
          <section className="hero">
            <p className="eyebrow">Senior App</p>
            <h1>Student Registration Validation</h1>
            <p className="subtitle">
              Create a student account, then use the GitHub linking action with an authenticated student token for the OAuth start flow.
            </p>
          </section>
          <section className="panel">
            {/* ...existing code... */}
            <form className="form" onSubmit={handleSubmit}>
              {/* ...existing code... */}
            </form>
            <div className="side-column">
              {/* ...existing code... */}
            </div>
          </section>
        </>
      ) : (
        <CoordinatorStudentIdUpload />
      )}
    </main>
  );
}
