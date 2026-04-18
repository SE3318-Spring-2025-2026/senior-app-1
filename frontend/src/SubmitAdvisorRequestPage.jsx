import { useState, useEffect } from 'react';
import apiClient from '../services/apiClient';

const initialForm = {
  groupId: '',
  professorId: '',
};

const initialFeedback = {
  status: '',
  title: '',
  result: '',
};

export default function SubmitAdvisorRequestPage() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [groups, setGroups] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [groupsRes, professorsRes] = await Promise.all([
          apiClient.get('/v1/groups/my-groups'),
          apiClient.get('/v1/professors/list'),
        ]);
        setGroups(groupsRes.data || []);
        setProfessors(professorsRes.data || []);
      } catch (error) {
        console.error('Failed to load data:', error);
        setFeedback({
          status: 'error',
          title: 'Error',
          result: error.mappedError?.result || 'Failed to load groups and professors',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ status: 'loading', title: '', result: '' });
    setIsSubmitting(true);

    try {
      await apiClient.post('/v1/advisor-requests', {
        groupId: parseInt(form.groupId, 10),
        professorId: parseInt(form.professorId, 10),
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
      console.error('Submit error:', error);
      const errorData = error.response?.data;
      setFeedback({
        status: 'error',
        title: errorData?.code || 'Error',
        result: errorData?.message || error.mappedError?.result || 'Failed to submit request',
      });
    } finally {
      setIsSubmitting(false);
    }
  };\n\n  if (isLoading) {\n    return (\n      <div className=\"page\">\n        <div className=\"feedback feedback-loading\">\n          <h2>Loading...</h2>\n        </div>\n      </div>\n    );\n  }\n\n  return (\n    <div className=\"page\">\n      <div className=\"hero\">\n        <h1>Submit Advisor Request</h1>\n        <p className=\"subtitle\">Request a professor to be your group's advisor</p>\n      </div>\n\n      <div className=\"panel\">\n        <form className=\"form\" onSubmit={handleSubmit}>\n          <div className=\"field\">\n            <span>Your Group *</span>\n            <select\n              name=\"groupId\"\n              value={form.groupId}\n              onChange={handleChange}\n              disabled={isSubmitting}\n              required\n            >\n              <option value=\"\">-- Select a group --</option>\n              {groups.map((group) => (\n                <option key={group.id} value={group.id}>\n                  {group.name}\n                  {group.advisorId ? ' (Already has advisor)' : ''}\n                </option>\n              ))}\n            </select>\n          </div>\n\n          <div className=\"field\">\n            <span>Select Professor *</span>\n            <select\n              name=\"professorId\"\n              value={form.professorId}\n              onChange={handleChange}\n              disabled={isSubmitting}\n              required\n            >\n              <option value=\"\">-- Select a professor --</option>\n              {professors.map((prof) => (\n                <option key={prof.id} value={prof.id}>\n                  {prof.fullName}\n                </option>\n              ))}\n            </select>\n          </div>\n\n          <button\n            type=\"submit\"\n            disabled={\n              isSubmitting\n              || !form.groupId\n              || !form.professorId\n              || groups.length === 0\n              || professors.length === 0\n            }\n          >\n            {isSubmitting ? 'Submitting...' : 'Submit Request'}\n          </button>\n        </form>\n\n        {feedback.status && (\n          <div className={`feedback feedback-${feedback.status}`}>\n            <div className=\"feedback-label\">{feedback.status}</div>\n            {feedback.title && <h2>{feedback.title}</h2>}\n            <p>{feedback.result}</p>\n          </div>\n        )}\n      </div>\n    </div>\n  );\n}
