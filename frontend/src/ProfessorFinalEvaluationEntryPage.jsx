import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function ProfessorFinalEvaluationEntryPage() {
  const navigate = useNavigate();
  const [groupId, setGroupId] = useState('');
  const [gradeType, setGradeType] = useState('advisor');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = groupId.trim();
    if (!trimmed) return;
    const path = gradeType === 'advisor'
      ? `/professors/final-evaluation/${trimmed}/advisor-grade`
      : `/professors/final-evaluation/${trimmed}/committee-grade`;
    navigate(path);
  }

  return (
    <div className="page">
      <div className="back-link-wrap">
        <Link className="back-link" to="/professors">← Back to Professor Home</Link>
      </div>

      <div className="hero">
        <p className="eyebrow">Final Evaluation</p>
        <h1>Submit a Grade</h1>
        <p className="subtitle">
          Enter the group ID and select whether you are submitting an advisor grade or a committee grade.
        </p>
      </div>

      <div className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Group ID</span>
            <input
              type="text"
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              required
            />
            <div className="field-help">Paste the UUID of the group you are grading.</div>
          </label>

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 500, marginBottom: '8px' }}>Grade Type</legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="gradeType"
                value="advisor"
                checked={gradeType === 'advisor'}
                onChange={() => setGradeType('advisor')}
              />
              Advisor Grade (assigned advisor only)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="gradeType"
                value="committee"
                checked={gradeType === 'committee'}
                onChange={() => setGradeType('committee')}
              />
              Committee Grade (any professor)
            </label>
          </fieldset>

          <button type="submit" disabled={!groupId.trim()}>
            Open Grading Form →
          </button>
        </form>
      </div>
    </div>
  );
}
