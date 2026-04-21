import { useState } from 'react';

const DELIVERABLE_TYPES = ['PROPOSAL', 'SOW'];

function buildEmptySprint() {
  return { id: crypto.randomUUID(), sprintNumber: '', weight: '' };
}

export default function WeightConfiguration() {
  const [deliverableType, setDeliverableType] = useState(DELIVERABLE_TYPES[0]);
  const [sprints, setSprints] = useState([buildEmptySprint()]);
  const [submitted, setSubmitted] = useState(null);

  // Derived — no useEffect
  const totalWeight = sprints.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
  const isOverLimit = totalWeight > 100;
  const isSubmitDisabled = isOverLimit || sprints.some((s) => s.sprintNumber === '' || s.weight === '');

  function handleSprintChange(id, field, raw) {
    setSprints((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (field === 'weight') {
          // Clamp to [0, 100] at input time
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
    setSprints((prev) => [...prev, buildEmptySprint()]);
  }

  function removeSprint(id) {
    setSprints((prev) => prev.filter((s) => s.id !== id));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      deliverableType,
      weights: sprints.map((s) => ({
        sprintNumber: Number(s.sprintNumber),
        weight: Number(s.weight),
      })),
    };
    setSubmitted(payload);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Weight Configuration</h1>
        <p className="text-sm text-gray-500 mb-6">
          Assign sprint weight percentages to a deliverable type.
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* Deliverable type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deliverable Type
            </label>
            <select
              value={deliverableType}
              onChange={(e) => setDeliverableType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DELIVERABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Sprint rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Sprints</span>
              <button
                type="button"
                onClick={addSprint}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Sprint
              </button>
            </div>

            <div className="space-y-2">
              {sprints.map((sprint, idx) => (
                <div
                  key={sprint.id}
                  className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
                >
                  <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>

                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-0.5">Sprint #</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 1"
                      value={sprint.sprintNumber}
                      onChange={(e) => handleSprintChange(sprint.id, 'sprintNumber', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-0.5">Weight (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="0–100"
                      value={sprint.weight}
                      onChange={(e) => handleSprintChange(sprint.id, 'weight', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSprint(sprint.id)}
                    disabled={sprints.length === 1}
                    className="mt-4 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                    aria-label="Remove sprint"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Total weight indicator */}
          <div
            className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
              isOverLimit
                ? 'bg-red-50 border border-red-300 text-red-600'
                : 'bg-green-50 border border-green-200 text-green-700'
            }`}
            aria-live="polite"
          >
            <span>Total Weight</span>
            <span>
              {totalWeight}%
              {isOverLimit && ' — exceeds 100%'}
            </span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit Configuration
          </button>
        </form>

        {/* Payload preview */}
        {submitted && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Last Submitted Payload
            </p>
            <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-4 overflow-x-auto">
              {JSON.stringify(submitted, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
