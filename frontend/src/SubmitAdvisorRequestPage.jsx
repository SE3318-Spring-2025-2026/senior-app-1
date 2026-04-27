import { useEffect, useState } from 'react';
import apiClient from './services/apiClient';

const initialForm = {
  groupId: '',
  professorId: '',
};

const initialFeedback = {
  status: '',
  title: '',
  result: '',
};

const initialFieldErrors = {
  groupId: [],
  professorId: [],
};

export default function SubmitAdvisorRequestPage() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [fieldErrors, setFieldErrors] = useState(initialFieldErrors);
  const [groups, setGroups] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedGroup = groups.find((group) => String(group.id) === String(form.groupId)) || null;
  const selectedGroupHasAdvisor = Boolean(selectedGroup?.advisorId);
  const eligibleGroups = groups.filter((group) => !group.advisorId);
  const hasLeaderGroup = groups.length > 0;
  const canSubmit = hasLeaderGroup && eligibleGroups.length > 0 && professors.length > 0;

  useEffect(() => {
    async function loadData() {
      try {
        const [groupsRes, professorsRes] = await Promise.all([
          apiClient.get('/v1/groups/my-groups'),
          apiClient.get('/v1/professors/list'),
        ]);
        setGroups(groupsRes.data || []);
        setProfessors(professorsRes.data || []);
        setFeedback(initialFeedback);
      } catch (error) {
        console.error('Failed to load advisor request form data:', error);
        setFeedback({
          status: 'error',
          title: 'Error',
          result: error.response?.data?.message || 'Failed to load groups and professors.',
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

    if (fieldErrors[name]?.length > 0) {
      setFieldErrors((current) => ({
        ...current,
        [name]: [],
      }));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFeedback({ status: 'loading', title: '', result: '' });
    setFieldErrors(initialFieldErrors);
    setIsSubmitting(true);

    try {
      await apiClient.post('/v1/advisor-requests', {
        groupId: form.groupId,
        professorId: Number(form.professorId),
      });

      setFeedback({
        status: 'success',
        title: 'Request Submitted',
        result: 'Your advisor request has been submitted successfully.',
      });
      setForm(initialForm);

      const groupsRes = await apiClient.get('/v1/groups/my-groups');
      setGroups(groupsRes.data || []);
    } catch (error) {
      console.error('Submit advisor request error:', error);
      const errorData = error.response?.data || {};
      setFieldErrors({
        groupId: errorData.errors?.groupId || [],
        professorId: errorData.errors?.professorId || errorData.errors?.advisorId || [],
      });
      setFeedback({
        status: 'error',
        title: errorData.code || 'Error',
        result: errorData.message || 'Failed to submit request.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="feedback feedback-loading">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>Submit Advisor Request</h1>
        <p className="subtitle">Request a professor to be your group&apos;s advisor.</p>
      </div>

      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          {!hasLeaderGroup && (
            <div className="feedback feedback-warning" role="status" aria-live="polite">
              <div className="feedback-label">restricted</div>
              <h2>Team leader access required</h2>
              <p>You can submit an advisor request only for a group that you lead.</p>
            </div>
          )}

          <label className="field">
            <span>Your Group *</span>
            <select
              name="groupId"
              value={form.groupId}
              onChange={handleChange}
              disabled={isSubmitting || !hasLeaderGroup}
              aria-invalid={fieldErrors.groupId.length > 0}
              required
            >
              <option value="">-- Select a group --</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id} disabled={Boolean(group.advisorId)}>
                  {group.name}
                  {group.advisorId ? ' (Already has advisor)' : ''}
                </option>
              ))}
            </select>
            {!hasLeaderGroup && (
              <div className="field-help" role="note">
                No team-leader group was found for your account.
              </div>
            )}
            {hasLeaderGroup && eligibleGroups.length === 0 && (
              <div className="field-help" role="note">
                All of your groups already have advisors, so no new advisor request can be created.
              </div>
            )}
            {fieldErrors.groupId.length > 0 && (
              <div className="field-error" role="alert">
                {fieldErrors.groupId.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
          </label>

          <label className="field">
            <span>Select Professor *</span>
            <select
              name="professorId"
              value={form.professorId}
              onChange={handleChange}
              disabled={isSubmitting || !form.groupId || selectedGroupHasAdvisor || !hasLeaderGroup}
              aria-invalid={fieldErrors.professorId.length > 0}
              required
            >
              <option value="">-- Select a professor --</option>
              {professors.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.fullName}
                  {professor.department ? ` (${professor.department})` : ''}
                </option>
              ))}
            </select>
            {selectedGroupHasAdvisor && (
              <div className="field-help" role="note">
                This group already has an assigned advisor. Choose a different group to submit a new request.
              </div>
            )}
            {fieldErrors.professorId.length > 0 && (
              <div className="field-error" role="alert">
                {fieldErrors.professorId.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
          </label>

          <button
            type="submit"
            disabled={
              isSubmitting
              || !form.groupId
              || !form.professorId
              || !canSubmit
              || selectedGroupHasAdvisor
            }
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        {feedback.status && (
          <div className={`feedback feedback-${feedback.status}`} aria-live="polite">
            <div className="feedback-label">{feedback.status}</div>
            {feedback.title && <h2>{feedback.title}</h2>}
            <p>{feedback.result}</p>
          </div>
        )}
      </div>
    </div>
  );
}
