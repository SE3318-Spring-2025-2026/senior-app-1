import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './contexts/NotificationContext';
import apiClient from './services/apiClient';

const DELIVERABLE_TYPES = ['PROPOSAL', 'SOW'];

function emptyCriterion() {
  return { name: '', maxPoints: '' };
}

export default function CoordinatorRubricPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [deliverableType, setDeliverableType] = useState('PROPOSAL');
  const [criteria, setCriteria] = useState([emptyCriterion()]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const token = window.localStorage.getItem('coordinatorToken') || '';

  useEffect(() => {
    if (!token) {
      notify({ type: 'warning', title: 'Login required', message: 'Please sign in as coordinator.' });
      navigate('/login', { replace: true });
    }
  }, [navigate, notify, token]);

  useEffect(() => {
    async function load() {
      setFetching(true);
      try {
        const { data } = await apiClient.get(`/v1/coordinator/rubrics/${deliverableType}`);
        if (data.rubric?.criteria?.length) {
          setCriteria(data.rubric.criteria.map((c) => ({ name: c.name, maxPoints: String(c.maxPoints) })));
        } else {
          setCriteria([emptyCriterion()]);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setCriteria([emptyCriterion()]);
        } else {
          notify({ type: 'error', title: 'Failed to load rubric', message: err.message });
        }
      } finally {
        setFetching(false);
      }
    }
    load();
  }, [deliverableType, notify]);

  function updateCriterion(index, field, value) {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addCriterion() {
    setCriteria((prev) => [...prev, emptyCriterion()]);
  }

  function removeCriterion(index) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const parsed = criteria.map((c) => ({ name: c.name.trim(), maxPoints: Number(c.maxPoints) }));

    const names = parsed.map((c) => c.name);
    if (new Set(names).size !== names.length) {
      notify({ type: 'error', title: 'Duplicate criterion names', message: 'Each criterion must have a unique name.' });
      return;
    }

    if (parsed.some((c) => !c.name || isNaN(c.maxPoints) || c.maxPoints < 0)) {
      notify({ type: 'error', title: 'Invalid criteria', message: 'Each criterion needs a name and a non-negative max points value.' });
      return;
    }

    setLoading(true);
    try {
      await apiClient.put('/v1/coordinator/rubrics', { deliverableType, criteria: parsed });
      notify({ type: 'success', title: 'Rubric saved', message: `${deliverableType} rubric updated successfully.` });
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'DUPLICATE_CRITERION_NAME') {
        notify({ type: 'error', title: 'Duplicate criterion names', message: err.message });
      } else {
        notify({ type: 'error', title: 'Save failed', message: err.message || 'Could not save rubric.' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Coordinator Workspace</p>
        <h1>Grading Rubric Configuration</h1>
        <p className="subtitle">
          Define the grading criteria and maximum points for each deliverable type. Changes take effect immediately.
        </p>
      </section>

      <section className="form-section">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="deliverableType">Deliverable Type</label>
            <select
              id="deliverableType"
              value={deliverableType}
              onChange={(e) => setDeliverableType(e.target.value)}
              disabled={fetching || loading}
            >
              {DELIVERABLE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Criteria</label>
            {fetching ? (
              <p>Loading current rubric…</p>
            ) : (
              <>
                {criteria.map((criterion, index) => (
                  <div key={index} className="rubric-criterion-row">
                    <input
                      type="text"
                      placeholder="Criterion name"
                      value={criterion.name}
                      onChange={(e) => updateCriterion(index, 'name', e.target.value)}
                      disabled={loading}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Max points"
                      min="0"
                      step="0.5"
                      value={criterion.maxPoints}
                      onChange={(e) => updateCriterion(index, 'maxPoints', e.target.value)}
                      disabled={loading}
                      required
                    />
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => removeCriterion(index)}
                        disabled={loading}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}

                <button type="button" className="btn-secondary" onClick={addCriterion} disabled={loading}>
                  + Add Criterion
                </button>
              </>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading || fetching}>
              {loading ? 'Saving…' : 'Save Rubric'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/coordinator')} disabled={loading}>
              Back
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
