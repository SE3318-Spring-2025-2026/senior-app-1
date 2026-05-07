import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const initialFeedback = {
  type: 'idle',
  title: 'Ready to import',
  message: 'Paste one student ID per line or separate them with commas.',
  insertedCount: 0,
  duplicateCount: 0,
  invalidFormatCount: 0,
};

function mapUploadError(payload, status) {
  if (status === 401) {
    return {
      type: 'error',
      title: 'Coordinator session required',
      message: payload.message || 'Provide a valid coordinator token and try again.',
    };
  }

  if (status === 403) {
    return {
      type: 'error',
      title: 'Coordinator access required',
      message: payload.message || 'This import endpoint only accepts coordinator credentials.',
    };
  }

  if (status === 400) {
    return {
      type: 'warning',
      title: 'Upload format invalid',
      message: payload.message || 'Add at least one student ID before uploading.',
    };
  }

  return {
    type: 'error',
    title: 'Import failed',
    message: payload.message || 'The valid student ID upload could not be completed.',
  };
}

function parseStudentIds(rawValue) {
  return rawValue
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export default function CoordinatorStudentIdUploadPage() {
  const [studentIdsText, setStudentIdsText] = useState('');
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { notify } = useNotification();
  const token = window.localStorage.getItem('coordinatorToken') || '';

  useEffect(() => {
    if (token) {
      return;
    }

    notify({
      type: 'warning',
      title: 'Coordinator login required',
      message: 'Please sign in before opening the student ID upload page.',
    });
    navigate('/login', { replace: true });
  }, [navigate, notify, token]);

  async function handleSubmit(event) {
    event.preventDefault();
    const studentIds = parseStudentIds(studentIdsText);

    setSubmitting(true);
    setFeedback({
      ...initialFeedback,
      type: 'loading',
      title: 'Importing student IDs',
      message: 'Uploading the batch and checking inserted, duplicate, and invalid values.',
    });

    try {
      const { data: result } = await apiClient.post('/v1/coordinator/student-id-registry/import', { studentIds });

      setFeedback({
        type: 'success',
        title: 'Import completed',
        message: result.message || 'Valid student IDs processed successfully.',
        insertedCount: result.insertedCount || 0,
        duplicateCount: result.duplicateCount || 0,
        invalidFormatCount: result.invalidFormatCount || 0,
      });
      setStudentIdsText('');
      notify({
        type: 'success',
        title: 'Student ID registry updated',
        message: `${result.insertedCount} inserted, ${result.duplicateCount} duplicate, ${result.invalidFormatCount} invalid.`,
      });
    } catch (err) {
      if (err.response) {
        const mapped = mapUploadError(err.response.data || {}, err.response.status);
        setFeedback({
          ...initialFeedback,
          ...mapped,
        });
        notify({
          type: mapped.type === 'warning' ? 'warning' : 'error',
          title: mapped.title,
          message: mapped.message,
        });
        return;
      }
      setFeedback({
        ...initialFeedback,
        type: 'error',
        title: 'Network error',
        message: 'The coordinator upload request could not reach the backend.',
      });
      notify({
        type: 'error',
        title: 'Network error',
        message: 'The coordinator upload request could not reach the backend.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Coordinator Workspace</p>
        <h1>Import Valid Student IDs</h1>
        <p className="subtitle">
          Coordinators can upload the eligibility registry here in bulk. The result summary reports newly inserted IDs,
          duplicates, and invalid formats immediately after import.
        </p>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/coordinator">
          Back to Coordinator Workspace
        </Link>
      </p>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Student IDs</span>
            <textarea
              id="studentIds"
              name="studentIds"
              placeholder={'11070001000\n11070001001\n11070001002'}
              value={studentIdsText}
              onChange={(event) => setStudentIdsText(event.target.value)}
              required
            />
          </label>

          <p className="token-note">
            Paste one ID per line or use commas. Only 11-digit student IDs are accepted by the registry.
          </p>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Importing IDs...' : 'Import Student IDs'}
          </button>
        </form>

        <div className="side-column">
          <section className="token-panel">
            <p className="feedback-label">Import Summary</p>
            <div className="stats-grid">
              <article className="stat-card">
                <span>Inserted</span>
                <strong>{feedback.insertedCount}</strong>
              </article>
              <article className="stat-card">
                <span>Duplicate</span>
                <strong>{feedback.duplicateCount}</strong>
              </article>
              <article className="stat-card">
                <span>Invalid</span>
                <strong>{feedback.invalidFormatCount}</strong>
              </article>
            </div>
          </section>

          <section className={`feedback feedback-${feedback.type}`} aria-live="polite">
            <p className="feedback-label">Current Status</p>
            <h2>{feedback.title}</h2>
            <p>{feedback.message}</p>
          </section>
        </div>
      </section>
    </main>
  );
}
