import { useState } from 'react';
import apiClient from '../services/apiClient';

const initialForm = {
  email: '',
  fullName: '',
  department: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Waiting for input',
  message: 'Submit the professor registration form.',
  userId: '',
  professorId: '',
  result: '',
};

export default function AdminProfessorRegistration() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback({
      type: 'info',
      title: 'Submitting...',
      message: 'Creating professor account.',
    });

    try {
      const response = await apiClient.post('/v1/admin/professors', form);
      const { userId, professorId, message } = response.data;
      setFeedback({
        type: 'success',
        title: 'Professor registered successfully',
        message: message,
        userId: userId,
        professorId: professorId,
        result: 'Created',
      });
      setForm(initialForm);
    } catch (error) {
      const mappedError = error.mappedError || {
        type: 'error',
        title: 'Registration failed',
        message: error.response?.data?.message || 'An error occurred.',
        userId: '',
        professorId: '',
        result: 'Failed',
      };
      setFeedback(mappedError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <p className="eyebrow">Admin Panel</p>
        <h1>Register Professor</h1>
        <p className="subtitle">Create a new professor account.</p>
      </div>
      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="professor@university.edu"
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
              placeholder="Prof. Ali Veli"
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
              placeholder="Computer Engineering"
              value={form.department}
              onChange={handleChange}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Registering...' : 'Register Professor'}
          </button>
        </form>
        <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
          <p className="feedback-label">Current Status</p>
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
    </div>
  );
}