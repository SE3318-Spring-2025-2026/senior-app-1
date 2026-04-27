import { useState } from 'react';
import apiClient from './services/apiClient';

const DELIVERABLE_TYPES = ['PROPOSAL', 'SOW'];

function buildEmptySprint(sprintNumber = '') {
  return { id: crypto.randomUUID(), sprintNumber, weight: '' };
}

export default function CoordinatorWeightConfigurationPage() {
  const [deliverableType, setDeliverableType] = useState(DELIVERABLE_TYPES[0]);
  const [sprints, setSprints] = useState([buildEmptySprint('1')]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const totalWeight = sprints.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
  const isExact = totalWeight === 100;

  const filledSprintNumbers = sprints.map((s) => s.sprintNumber).filter((n) => n !== '');
  const hasDuplicates = new Set(filledSprintNumbers).size !== filledSprintNumbers.length;

  const isSubmitDisabled =
    !isExact ||
    hasDuplicates ||
    sprints.some((s) => s.sprintNumber === '' || s.weight === '');

  function handleSprintChange(id, field, raw) {
    setSuccess(false);
    setSprints((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (field === 'weight') {
          const numeric = raw === '' ? '' : Math.min(100, Math.max(0, Number(raw)));
          return { ...s, weight: numeric === '' ? '' : String(numeric) };
        }
        if (field === 'sprintNumber') {
          const numeric = raw === '' ? '' : Math.max(1, Math.floor(Number(raw)));
          return { ...s, sprintNumber: numeric === '' ? '' : String(numeric) };
        }
        return s;
      })
    );
  }

  function addSprint() {
    setSuccess(false);
    setSprints((prev) => [...prev, buildEmptySprint(String(prev.length + 1))]);
  }

  function removeSprint(id) {
    setSuccess(false);
    setSprints((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await apiClient.put('/v1/coordinator/weights', {
        deliverableType,
        sprintWeights: sprints.map((s) => ({
          sprintNumber: Number(s.sprintNumber),
          weightPercent: Number(s.weight),
        })),
      });
      setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to save configuration.');
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Coordinator · Grading</p>
        <h1>Weight Configuration</h1>
        <p className="subtitle">
          Assign sprint weight percentages to a deliverable type. Weights must sum to exactly 100%.
        </p>
      </section>

      <div className="single-panel">
        <form onSubmit={handleSubmit} noValidate className="form">

          {/* Deliverable type */}
          <label className="field">
            <span>Deliverable Type</span>
            <select
              value={deliverableType}
              onChange={(e) => { setDeliverableType(e.target.value); setSuccess(false); }}
            >
              {DELIVERABLE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          {/* Sprints header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--ink)' }}>Sprints</span>
            <button
              type="button"
              onClick={addSprint}
              style={{ width: 'auto', minWidth: 0, padding: '8px 16px', fontSize: '0.88rem' }}
            >
              + Add Sprint
            </button>
          </div>

          {/* Sprint rows */}
          <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
            {sprints.map((sprint, idx) => (
              <div key={sprint.id} className="group-member-row">
                <span style={{ color: 'var(--muted)', fontSize: '0.82rem', minWidth: '18px' }}>
                  {idx + 1}.
                </span>

                <label className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <span>Sprint #</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 1"
                    value={sprint.sprintNumber}
                    onChange={(e) => handleSprintChange(sprint.id, 'sprintNumber', e.target.value)}
                  />
                </label>

                <label className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <span>Weight (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="0–100"
                    value={sprint.weight}
                    onChange={(e) => handleSprintChange(sprint.id, 'weight', e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => removeSprint(sprint.id)}
                  disabled={sprints.length === 1}
                  aria-label="Remove sprint"
                  style={{
                    width: 'auto',
                    minWidth: 0,
                    padding: '8px 12px',
                    background: 'linear-gradient(140deg, #8f1d2c 0%, #b42336 100%)',
                    fontSize: '1rem',
                    alignSelf: 'flex-end',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Duplicate warning */}
          {hasDuplicates && (
            <div className="field-error" style={{ marginBottom: '12px' }}>
              <p>Duplicate sprint numbers are not allowed.</p>
            </div>
          )}

          {/* Total weight indicator */}
          <div
            className={`group-callout ${isExact ? 'group-callout-success' : 'group-callout-error'}`}
            aria-live="polite"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}
          >
            <span>Total Weight</span>
            <strong>{totalWeight}%{!isExact && ' — must equal exactly 100%'}</strong>
          </div>

          {/* Error / success feedback */}
          {error && (
            <div className="field-error" style={{ marginBottom: '16px' }}>
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="group-callout group-callout-success" style={{ marginBottom: '16px' }}>
              Configuration saved successfully.
            </div>
          )}

          <button type="submit" disabled={isSubmitDisabled}>
            Submit Configuration
          </button>
        </form>
      </div>
    </main>
  );
}
