import { useState, useEffect } from 'react';
import apiClient from '../services/apiClient';

const initialForm = {
  groupId: '',
  professorId: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Waiting for input',
  message: 'Submit the advisor request form.',
  result: '',
};

const initialFieldErrors = {
  groupId: [],
  professorId: [],
};

export default function AdvisorRequestForm() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [submitting, setSubmitting] = useState(false);
  const [professors, setProfessors] = useState([]);
  const [loadingProfessors, setLoadingProfessors] = useState(true);

  useEffect(() => {
    // Fetch list of professors
    const fetchProfessors = async () => {
      try {
        const response = await apiClient.get('/v1/professors');
        setProfessors(response.data || []);
      } catch (error) {
        console.error('Failed to fetch professors:', error);
        setProfessors([]);
      } finally {
        setLoadingProfessors(false);
      }
    };

    fetchProfessors();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error when user starts typing
    if (fieldErrors[name]?.length > 0) {
      setFieldErrors((prev) => ({ ...prev, [name]: [] }));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors(initialFieldErrors);
    setFeedback({
      type: 'loading',
      title: 'Submitting advisor request',
      message: 'Your request is being processed.',
      result: '',
    });

    try {
      const response = await apiClient.post('/v1/advisor-requests', {
        groupId: parseInt(form.groupId),
        professorId: parseInt(form.professorId),
      });

      setFeedback({
        type: 'success',
        title: 'Advisor request submitted',
        message: response.data.message || 'Your request has been sent to the professor.',
        result: 'Created',
      });
      setForm(initialForm);
      setFieldErrors(initialFieldErrors);
    } catch (error) {
      const errorData = error.response?.data;
      
      // Handle field-level validation errors
      if (errorData?.errors && typeof errorData.errors === 'object') {
        setFieldErrors(errorData.errors);
        setFeedback({
          type: 'error',
          title: errorData?.message || 'Validation failed',
          message: 'Please correct the errors below and try again',
          result: errorData?.code || 'Failed',
        });
      } else {
        // Handle general error responses
        setFeedback({
          type: 'error',
          title: errorData?.message || 'Request failed',
          message: errorData?.message || 'Failed to submit advisor request',
          result: errorData?.code || 'Failed',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <p className="eyebrow">Mentor Matching</p>
        <h1>Submit Advisor Request</h1>
        <p className="subtitle">Select a professor to request as your group's advisor.</p>
      </div>
      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Group ID</span>
            <input
              id="groupId"
              name="groupId"
              type="number"
              inputMode="numeric"
              placeholder="Enter your group ID"
              value={form.groupId}
              onChange={handleChange}
              aria-invalid={fieldErrors.groupId?.length > 0}
              aria-describedby={fieldErrors.groupId?.length > 0 ? 'groupId-error' : undefined}
              required
            />
            {fieldErrors.groupId?.length > 0 && (
              <div id="groupId-error" className="field-error">
                {fieldErrors.groupId.map((error, idx) => (
                  <p key={idx}>{error}</p>
                ))}
              </div>
            )}
          </label>

          <label className="field">
            <span>Select Professor</span>
            {loadingProfessors ? (
              <select disabled>
                <option>Loading professors...</option>
              </select>
            ) : (
              <>
                <select
                  id="professorId"
                  name="professorId"
                  value={form.professorId}
                  onChange={handleChange}
                  aria-invalid={fieldErrors.professorId?.length > 0}
                  aria-describedby={fieldErrors.professorId?.length > 0 ? 'professorId-error' : undefined}
                  required
                >
                  <option value="">Choose a professor</option>
                  {professors.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.User?.fullName} ({prof.department})
                    </option>
                  ))}
                </select>
                {fieldErrors.professorId?.length > 0 && (
                  <div id="professorId-error" className="field-error">
                    {fieldErrors.professorId.map((error, idx) => (
                      <p key={idx}>{error}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </label>

          <button type="submit" disabled={submitting || loadingProfessors}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
          <p className="feedback-label">Status</p>
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
    </div>
  );
}
import { useState, useEffect } from 'react';
import apiClient from '../services/apiClient';

const initialForm = {
  groupId: '',
  professorId: '',
};

const initialFeedback = {
  type: 'idle',
  title: 'Waiting for input',
  message: 'Submit the advisor request form.',
  result: '',
};

const initialFieldErrors = {
  groupId: [],
  professorId: [],
};

export default function AdvisorRequestForm() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [submitting, setSubmitting] = useState(false);
  const [professors, setProfessors] = useState([]);
  const [loadingProfessors, setLoadingProfessors] = useState(true);

  useEffect(() => {
    // Fetch list of professors
    const fetchProfessors = async () => {
      try {
        const response = await apiClient.get('/v1/professors');
        setProfessors(response.data || []);
      } catch (error) {
        console.error('Failed to fetch professors:', error);
        setProfessors([]);
      } finally {
        setLoadingProfessors(false);
      }
    };

    fetchProfessors();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error when user starts typing
    if (fieldErrors[name]?.length > 0) {
      setFieldErrors((prev) => ({ ...prev, [name]: [] }));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors(initialFieldErrors);
    setFeedback({
      type: 'loading',
      title: 'Submitting advisor request',
      message: 'Your request is being processed.',
      result: '',
    });

    try {
      const response = await apiClient.post('/v1/advisor-requests', {
        groupId: parseInt(form.groupId),
        professorId: parseInt(form.professorId),
      });

      setFeedback({
        type: 'success',
        title: 'Advisor request submitted',
        message: response.data.message || 'Your request has been sent to the professor.',
        result: 'Created',
      });
      setForm(initialForm);
      setFieldErrors(initialFieldErrors);
    } catch (error) {
      const errorData = error.response?.data;
      
      // Handle field-level validation errors
      if (errorData?.errors && typeof errorData.errors === 'object') {
        setFieldErrors(errorData.errors);
        setFeedback({
          type: 'error',
          title: errorData?.message || 'Validation failed',
          message: 'Please correct the errors below and try again',
          result: errorData?.code || 'Failed',
        });
      } else {
        // Handle general error responses
        setFeedback({
          type: 'error',
          title: errorData?.message || 'Request failed',
          message: errorData?.message || 'Failed to submit advisor request',
          result: errorData?.code || 'Failed',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <p className="eyebrow">Mentor Matching</p>
        <h1>Submit Advisor Request</h1>
        <p className="subtitle">Select a professor to request as your group's advisor.</p>
      </div>
      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Group ID</span>
            <input
              id="groupId"
              name="groupId"
              type="number"
              inputMode="numeric"
              placeholder="Enter your group ID"
              value={form.groupId}
              onChange={handleChange}
              aria-invalid={fieldErrors.groupId?.length > 0}
              aria-describedby={fieldErrors.groupId?.length > 0 ? 'groupId-error' : undefined}
              required
            />
            {fieldErrors.groupId?.length > 0 && (
              <div id="groupId-error" className="field-error">
                {fieldErrors.groupId.map((error, idx) => (
                  <p key={idx}>{error}</p>
                ))}
              </div>
            )}
          </label>

          <label className="field">
            <span>Select Professor</span>
            {loadingProfessors ? (
              <select disabled>
                <option>Loading professors...</option>
              </select>
            ) : (
              <>
                <select
                  id="professorId"
                  name="professorId"
                  value={form.professorId}
                  onChange={handleChange}
                  aria-invalid={fieldErrors.professorId?.length > 0}
                  aria-describedby={fieldErrors.professorId?.length > 0 ? 'professorId-error' : undefined}
                  required
                >
                  <option value="">Choose a professor</option>
                  {professors.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.User?.fullName} ({prof.department})
                    </option>
                  ))}
                </select>
                {fieldErrors.professorId?.length > 0 && (
                  <div id="professorId-error" className="field-error">
                    {fieldErrors.professorId.map((error, idx) => (
                      <p key={idx}>{error}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </label>

          <button type="submit" disabled={submitting || loadingProfessors}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
          <p className="feedback-label">Status</p>
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
    </div>
  );
}
