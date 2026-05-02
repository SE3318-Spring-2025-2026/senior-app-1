import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import { useAuth } from './contexts/AuthContext';
import apiClient from './services/apiClient';

const STUDENT_ID_PATTERN = /^[0-9]{11}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_LOGIN_ATTEMPTS = [
  {
    endpoint: '/v1/professors/login',
    role: 'professor',
    tokenKey: 'professorToken',
    userKey: 'professorUser',
    home: '/professors',
  },
  {
    endpoint: '/v1/coordinator/login',
    role: 'coordinator',
    tokenKey: 'coordinatorToken',
    userKey: 'coordinatorUser',
    home: '/coordinator',
  },
  {
    endpoint: '/v1/admin/login',
    role: 'admin',
    tokenKey: 'adminToken',
    userKey: 'adminUser',
    home: '/admin',
  },
];

const initialLoginFeedback = {
  type: 'idle',
  title: 'Ready',
  message: 'Enter your 11-digit student ID or your email and password.',
};

const initialSignupFeedback = {
  type: 'idle',
  title: 'Ready',
  message: 'Sign up creates a student account. Other roles are provisioned by operations.',
};

const initialSignupForm = {
  studentId: '',
  fullName: '',
  email: '',
  password: '',
};

function detectInputKind(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return 'empty';
  }
  if (STUDENT_ID_PATTERN.test(trimmed)) {
    return 'studentId';
  }
  if (EMAIL_PATTERN.test(trimmed)) {
    return 'email';
  }
  return 'invalid';
}

function persistSession({ tokenKey, userKey }, result) {
  const token = result.token || '';
  window.localStorage.setItem(tokenKey, token);
  window.localStorage.setItem('authToken', token);
  window.localStorage.setItem(userKey, JSON.stringify(result.user || {}));
}

async function loginWithStudentId({ identifier, password }) {
  const { data: result } = await apiClient.post('/v1/students/login', {
    studentId: identifier,
    password,
  });
  persistSession(
    { tokenKey: 'studentToken', userKey: 'studentUser' },
    result,
  );
  return { result, home: '/home', role: 'student' };
}

async function loginWithEmail({ identifier, password }) {
  let lastError = null;
  for (const attempt of EMAIL_LOGIN_ATTEMPTS) {
    try {
      const { data: result } = await apiClient.post(attempt.endpoint, {
        email: identifier,
        password,
      });
      persistSession(attempt, result);
      return { result, home: attempt.home, role: attempt.role };
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      if (status === 401 || status === 404) {
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Email login failed');
}

const LOGIN_PAGE_STYLES = `
.lp-shell {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 15% 20%, rgba(56, 195, 204, 0.18), transparent 55%),
    radial-gradient(circle at 85% 80%, rgba(18, 168, 178, 0.16), transparent 55%),
    linear-gradient(180deg, #1b2431 0%, #151b24 100%);
  color: var(--ink, #e6edf7);
  overflow: hidden;
  box-sizing: border-box;
}
.lp-card {
  width: 100%;
  max-width: 420px;
  max-height: calc(100vh - 48px);
  background: rgba(20, 27, 38, 0.96);
  border: 1px solid var(--line, rgba(168, 183, 206, 0.2));
  border-radius: 24px;
  box-shadow: var(--shadow, 0 24px 64px rgba(6, 10, 16, 0.45));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.lp-brand {
  padding: 20px 28px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.lp-brand__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent-strong, #38c3cc);
  box-shadow: 0 0 0 4px rgba(56, 195, 204, 0.18);
}
.lp-brand__name {
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted, #a9b4c4);
  font-weight: 600;
}
.lp-switch {
  margin: 4px 22px 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: rgba(64, 77, 98, 0.32);
  border: 1px solid var(--line, rgba(168, 183, 206, 0.2));
  border-radius: 999px;
  padding: 4px;
}
.lp-switch__btn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--muted, #a9b4c4);
  padding: 9px 0;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  font-family: inherit;
}
.lp-switch__btn[aria-selected="true"] {
  background: linear-gradient(135deg, var(--accent, #12a8b2) 0%, var(--accent-strong, #38c3cc) 100%);
  color: #07171a;
  box-shadow: 0 6px 16px rgba(18, 168, 178, 0.35);
}
.lp-switch__btn:focus-visible {
  outline: 2px solid var(--accent-strong, #38c3cc);
  outline-offset: 2px;
}
.lp-form {
  padding: 0 28px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.lp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lp-field > span {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted, #a9b4c4);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.lp-field input {
  width: 100%;
  appearance: none;
  border: 1px solid var(--line, rgba(168, 183, 206, 0.2));
  background: rgba(24, 33, 47, 0.96);
  color: var(--ink, #e6edf7);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  box-sizing: border-box;
}
.lp-field input::placeholder {
  color: rgba(169, 180, 196, 0.55);
}
.lp-field input:focus {
  outline: none;
  border-color: var(--accent-strong, #38c3cc);
  box-shadow: 0 0 0 3px rgba(56, 195, 204, 0.2);
}
.lp-field input[aria-invalid="true"] {
  border-color: rgba(248, 113, 113, 0.55);
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.15);
}
.lp-submit {
  appearance: none;
  margin-top: 4px;
  padding: 11px 16px;
  border: none;
  border-radius: 999px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  color: #07171a;
  background: linear-gradient(135deg, var(--accent, #12a8b2) 0%, var(--accent-strong, #38c3cc) 100%);
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  font-family: inherit;
  letter-spacing: 0.02em;
}
.lp-submit:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(18, 168, 178, 0.4);
}
.lp-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.lp-feedback {
  margin: 0 28px 22px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(24, 33, 47, 0.96);
  border: 1px solid var(--line, rgba(168, 183, 206, 0.2));
  border-left: 3px solid var(--muted, #a9b4c4);
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.lp-feedback h2 {
  font-size: 12.5px;
  font-weight: 700;
  margin: 0;
  letter-spacing: 0.04em;
  color: var(--ink, #e6edf7);
  text-transform: uppercase;
}
.lp-feedback p {
  font-size: 12.5px;
  color: var(--muted, #a9b4c4);
  margin: 0;
}
.lp-feedback-loading {
  background: var(--info-bg, rgba(9, 57, 70, 0.96));
  border-color: var(--info-line, rgba(56, 195, 204, 0.28));
  border-left-color: var(--accent-strong, #38c3cc);
}
.lp-feedback-loading h2,
.lp-feedback-loading p { color: var(--info-ink, #d9fbff); }
.lp-feedback-success {
  background: var(--success-bg, rgba(10, 58, 41, 0.96));
  border-color: var(--success-line, rgba(74, 222, 128, 0.28));
  border-left-color: rgba(74, 222, 128, 0.6);
}
.lp-feedback-success h2,
.lp-feedback-success p { color: var(--success-ink, #dcfce7); }
.lp-feedback-error {
  background: var(--error-bg, rgba(72, 24, 27, 0.94));
  border-color: var(--error-line, rgba(248, 113, 113, 0.34));
  border-left-color: rgba(248, 113, 113, 0.7);
}
.lp-feedback-error h2 { color: var(--error-ink-strong, #ffe4e6); }
.lp-feedback-error p { color: var(--error-ink, #fecaca); }
.lp-feedback-warning {
  background: var(--warning-bg, rgba(95, 52, 12, 0.96));
  border-color: var(--warning-line, rgba(245, 158, 11, 0.28));
  border-left-color: rgba(245, 158, 11, 0.7);
}
.lp-feedback-warning h2,
.lp-feedback-warning p { color: var(--warning-ink, #ffedd5); }
@media (max-height: 620px) {
  .lp-brand { padding: 14px 28px 8px; }
  .lp-switch { margin: 2px 22px 12px; }
  .lp-form { gap: 9px; padding-bottom: 12px; }
  .lp-feedback { margin-bottom: 14px; }
}
`;

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [feedback, setFeedback] = useState(initialLoginFeedback);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const { notify } = useNotification();
  const { login } = useAuth();


  function switchMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setFeedback(nextMode === 'login' ? initialLoginFeedback : initialSignupFeedback);
  }

  function updateSignupField(event) {
    const { name, value } = event.target;
    setSignupForm((current) => ({ ...current, [name]: value }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const trimmedIdentifier = identifier.trim();
    const kind = detectInputKind(trimmedIdentifier);

    if (kind === 'invalid' || kind === 'empty') {
      setFeedback({
        type: 'error',
        title: 'Invalid identifier',
        message:
          'Enter an 11-digit student ID (digits only) or a valid email address before signing in.',
      });
      return;
    }

    if (!loginPassword) {
      setFeedback({
        type: 'warning',
        title: 'Password required',
        message: 'Enter your password to continue.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Signing in',
      message:
        kind === 'studentId'
          ? 'Checking your student credentials.'
          : 'Checking your email and password.',
    });

    try {
      const outcome =
        kind === 'studentId'
          ? await loginWithStudentId({ identifier: trimmedIdentifier, password: loginPassword })
          : await loginWithEmail({ identifier: trimmedIdentifier, password: loginPassword });

      const { result, home, role } = outcome;
      login(result.token || '', result.user || null);

      setFeedback({
        type: 'success',
        title: 'Signed in',
        message: result.message || 'Sign in successful. Redirecting to your home page.',
      });
      notify({
        type: 'success',
        title: 'Signed in',
        message: `${role.charAt(0).toUpperCase()}${role.slice(1)} login successful.`,
      });

      window.setTimeout(() => navigate(home, { replace: true }), 400);
    } catch (err) {
      const status = err.response?.status;
      const payloadMessage = err.response?.data?.message;

      if (status === 401 || status === 403 || status === 404) {
        setFeedback({
          type: 'error',
          title: 'Login failed',
          message:
            payloadMessage ||
            (kind === 'studentId'
              ? 'Invalid student ID or password.'
              : 'Invalid email or password.'),
        });
      } else if (status === 400) {
        setFeedback({
          type: 'warning',
          title: 'Missing information',
          message: payloadMessage || 'Identifier and password are required.',
        });
      } else if (err.response) {
        setFeedback({
          type: 'error',
          title: 'Login failed',
          message: payloadMessage || 'Login could not be completed.',
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Network error',
          message:
            'The login request could not reach the backend. Check whether the backend server is running.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();

    const trimmedStudentId = signupForm.studentId.trim();
    const trimmedFullName = signupForm.fullName.trim();
    const trimmedEmail = signupForm.email.trim();

    if (!STUDENT_ID_PATTERN.test(trimmedStudentId)) {
      setFeedback({
        type: 'error',
        title: 'Invalid student ID',
        message: 'Student ID must be exactly 11 digits.',
      });
      return;
    }
    if (!trimmedFullName) {
      setFeedback({
        type: 'warning',
        title: 'Full name required',
        message: 'Enter your full name to continue.',
      });
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setFeedback({
        type: 'error',
        title: 'Invalid email',
        message: 'Enter a valid email address.',
      });
      return;
    }
    if (!signupForm.password) {
      setFeedback({
        type: 'warning',
        title: 'Password required',
        message: 'Enter a password to continue.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      type: 'loading',
      title: 'Creating account',
      message: 'Creating your student account.',
    });

    try {
      await apiClient.post('/v1/auth/register', {
        role: 'STUDENT',
        studentId: trimmedStudentId,
        fullName: trimmedFullName,
        email: trimmedEmail,
        password: signupForm.password,
      });

      notify({
        type: 'success',
        title: 'Account created',
        message: 'Sign in with your new credentials.',
      });

      setMode('login');
      setIdentifier(trimmedStudentId);
      setLoginPassword('');
      setSignupForm(initialSignupForm);
      setFeedback({
        type: 'success',
        title: 'Account created',
        message: 'Account created. Sign in below to continue.',
      });
    } catch (err) {
      const payloadMessage = err.response?.data?.message;
      if (err.response) {
        setFeedback({
          type: 'error',
          title: 'Sign up failed',
          message: payloadMessage || 'Could not create the account.',
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Network error',
          message:
            'The sign up request could not reach the backend. Check whether the backend server is running.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmitLogin = !submitting && Boolean(identifier.trim()) && Boolean(loginPassword);

  const canSubmitSignup =
    !submitting &&
    Boolean(signupForm.studentId.trim()) &&
    Boolean(signupForm.fullName.trim()) &&
    Boolean(signupForm.email.trim()) &&
    Boolean(signupForm.password);

  return (
    <div className="lp-shell">
      <style>{LOGIN_PAGE_STYLES}</style>
      <section className="lp-card" aria-label="Authentication">
        <header className="lp-brand">
          <span className="lp-brand__dot" aria-hidden="true" />
          <span className="lp-brand__name">Senior App</span>
        </header>

        <div className="lp-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className="lp-switch__btn"
            onClick={() => switchMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className="lp-switch__btn"
            onClick={() => switchMode('signup')}
          >
            Sign up
          </button>
        </div>

        {mode === 'login' ? (
          <form className="lp-form" onSubmit={handleLoginSubmit} noValidate>
            <label className="lp-field">
              <span>Student ID or Email</span>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                placeholder="11070001000 or you@example.edu"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
              />
            </label>

            <label className="lp-field">
              <span>Password</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </label>

            <button type="submit" className="lp-submit" disabled={!canSubmitLogin}>
              {submitting ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form className="lp-form" onSubmit={handleSignupSubmit} noValidate>
            <label className="lp-field">
              <span>Student ID</span>
              <input
                name="studentId"
                type="text"
                inputMode="numeric"
                maxLength="11"
                placeholder="11070001000"
                value={signupForm.studentId}
                onChange={updateSignupField}
                required
              />
            </label>

            <label className="lp-field">
              <span>Full name</span>
              <input
                name="fullName"
                type="text"
                autoComplete="name"
                placeholder="Ada Lovelace"
                value={signupForm.fullName}
                onChange={updateSignupField}
                required
              />
            </label>

            <label className="lp-field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.edu"
                value={signupForm.email}
                onChange={updateSignupField}
                required
              />
            </label>

            <label className="lp-field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Choose a strong password"
                value={signupForm.password}
                onChange={updateSignupField}
                required
              />
            </label>

            <button type="submit" className="lp-submit" disabled={!canSubmitSignup}>
              {submitting ? 'Signing up...' : 'Sign Up'}
            </button>
          </form>
        )}

        {feedback.type !== 'idle' && (
          <section
            className={`lp-feedback lp-feedback-${feedback.type}`}
            aria-live="polite"
          >
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
          </section>
        )}
      </section>
    </div>
  );
}
