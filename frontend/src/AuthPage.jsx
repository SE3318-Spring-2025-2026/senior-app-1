import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';

const LOGIN_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'professor', label: 'Professor' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'admin', label: 'Admin' },
];

function endpointForLogin(role) {
  switch (role) {
    case 'student':
      return '/api/v1/students/login';
    case 'professor':
      return '/api/v1/professors/login';
    case 'coordinator':
      return '/api/v1/coordinator/login';
    case 'admin':
      return '/api/v1/admin/login';
    default:
      return '';
  }
}

function userStorageKeyForRole(role) {
  switch (role) {
    case 'student':
      return 'studentUser';
    case 'professor':
      return 'professorUser';
    case 'coordinator':
      return 'coordinatorUser';
    case 'admin':
      return 'adminUser';
    default:
      return 'user';
  }
}

function tokenStorageKeyForRole(role) {
  switch (role) {
    case 'student':
      return 'studentToken';
    case 'professor':
      return 'professorToken';
    case 'coordinator':
      return 'coordinatorToken';
    case 'admin':
      return 'adminToken';
    default:
      return 'authToken';
  }
}

function routeForRole(role) {
  switch (role) {
    case 'student':
      return '/home';
    case 'professor':
      return '/professors';
    case 'coordinator':
      return '/coordinator';
    case 'admin':
      return '/admin';
    default:
      return '/home';
  }
}

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('student');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: 'idle', title: 'Authentication', message: 'Choose login or sign up.' });

  const [loginForm, setLoginForm] = useState({
    studentId: '',
    email: '',
    password: '',
  });

  const [signupForm, setSignupForm] = useState({
    studentId: '',
    fullName: '',
    email: '',
    password: '',
  });

  const navigate = useNavigate();
  const { notify } = useNotification();

  const isStudent = role === 'student';

  const canSubmit = useMemo(() => {
    if (mode === 'login') {
      if (isStudent) {
        return Boolean(loginForm.studentId && loginForm.password);
      }
      return Boolean(loginForm.email && loginForm.password);
    }

    return Boolean(signupForm.fullName && signupForm.email && signupForm.password);
  }, [isStudent, loginForm, mode, signupForm]);

  function updateLoginField(event) {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
  }

  function updateSignupField(event) {
    const { name, value } = event.target;
    setSignupForm((current) => ({ ...current, [name]: value }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback({ type: 'loading', title: 'Signing in', message: 'Checking your credentials.' });

    try {
      const payload = isStudent
        ? { studentId: loginForm.studentId.trim(), password: loginForm.password }
        : { email: loginForm.email.trim(), password: loginForm.password };

      const response = await fetch(endpointForLogin(role), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        setFeedback({
          type: 'error',
          title: 'Login failed',
          message: result.message || 'Credentials are invalid or request failed.',
        });
        return;
      }

      const userKey = userStorageKeyForRole(role);
      const tokenKey = tokenStorageKeyForRole(role);
      window.localStorage.setItem(userKey, JSON.stringify(result.user || {}));
      window.localStorage.setItem(tokenKey, result.token || '');
      window.localStorage.setItem('authToken', result.token || '');

      setFeedback({
        type: 'success',
        title: 'Signed in',
        message: 'Welcome back. Redirecting to your workspace.',
      });
      notify({ type: 'success', title: 'Signed in', message: `${LOGIN_ROLES.find((r) => r.value === role)?.label || 'User'} login successful.` });

      window.setTimeout(() => navigate(routeForRole(role), { replace: true }), 400);
    } catch {
      setFeedback({
        type: 'error',
        title: 'Network error',
        message: 'Could not reach backend. Check backend server status.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback({ type: 'loading', title: 'Creating account', message: 'Creating your account.' });

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'STUDENT',
          studentId: signupForm.studentId.trim(),
          fullName: signupForm.fullName.trim(),
          email: signupForm.email.trim(),
          password: signupForm.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setFeedback({
          type: 'error',
          title: 'Sign up failed',
          message: result.message || 'Could not create account.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        title: 'Account created',
        message: 'Account created. Now sign in with your credentials.',
      });
      notify({ type: 'success', title: 'Sign up successful', message: 'Account created successfully.' });

      setMode('login');
      setRole('student');
      setLoginForm((current) => ({
        ...current,
        studentId: signupForm.studentId,
        email: signupForm.email,
      }));
    } catch {
      setFeedback({
        type: 'error',
        title: 'Network error',
        message: 'Could not reach backend. Check backend server status.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Authentication</p>
        <h1>Login and Sign up</h1>
        <p className="subtitle">One place for authentication. No separate role login pages needed.</p>
      </section>

      <section className="single-panel">
        <section className="form">
          <div className="auth-mode-switch">
            <button type="button" className={`auth-switch${mode === 'login' ? ' auth-switch-active' : ''}`} onClick={() => setMode('login')}>
              Login
            </button>
            <button type="button" className={`auth-switch${mode === 'signup' ? ' auth-switch-active' : ''}`} onClick={() => setMode('signup')}>
              Sign up
            </button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="auth-form-grid">
              <label className="field">
                <span>Role</span>
                <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
                  {LOGIN_ROLES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              {isStudent ? (
                <label className="field">
                  <span>Student Number</span>
                  <input name="studentId" value={loginForm.studentId} onChange={updateLoginField} maxLength="11" required />
                </label>
              ) : (
                <label className="field">
                  <span>Email</span>
                  <input name="email" type="email" value={loginForm.email} onChange={updateLoginField} required />
                </label>
              )}

              <label className="field">
                <span>Password</span>
                <input name="password" type="password" value={loginForm.password} onChange={updateLoginField} required />
              </label>

              <button type="submit" disabled={submitting || !canSubmit}>
                {submitting ? 'Signing in...' : 'Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="auth-form-grid">
              <p className="token-note">Sign up creates Student accounts only. Professor accounts are admin-invite only. Coordinator/Admin are provisioned by operations.</p>

              <label className="field">
                <span>Student Number</span>
                <input name="studentId" value={signupForm.studentId} onChange={updateSignupField} maxLength="11" required />
              </label>

              <label className="field">
                <span>Full Name</span>
                <input name="fullName" value={signupForm.fullName} onChange={updateSignupField} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" value={signupForm.email} onChange={updateSignupField} required />
              </label>

              <label className="field">
                <span>Password</span>
                <input name="password" type="password" value={signupForm.password} onChange={updateSignupField} required />
              </label>

              <button type="submit" disabled={submitting || !canSubmit}>
                {submitting ? 'Creating...' : 'Sign up'}
              </button>
            </form>
          )}

          <p className="token-note">
            <Link to="/home">Back to Home</Link>
          </p>
        </section>

        <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
          <p className="feedback-label">Status</p>
          <h2>{feedback.title}</h2>
          <p>{feedback.message}</p>
        </section>
      </section>
    </main>
  );
}
