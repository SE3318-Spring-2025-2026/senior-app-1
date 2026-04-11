import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGroupFormation } from './hooks/useGroupFormation';

export default function GroupFormationPage() {
  const { createGroupShell, pending, group, error, reset } = useGroupFormation();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');

  function handleCancel() {
    setName('');
    reset();
    setShowForm(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      await createGroupShell(name);
      setName('');
      setShowForm(false);
    } catch {
      // error state is managed by the hook; stay on the form so the user sees it
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Team Leader Workspace</p>
        <h1>Group Formation</h1>
        <p className="subtitle">
          Create your group shell first. Once the group exists you can invite teammates and request
          an advisor.
        </p>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/">
          Back to Home
        </Link>
      </p>

      {group && !showForm && (
        <section className="panel">
          <section className="feedback feedback-success" aria-live="polite">
            <p className="feedback-label">Group Created</p>
            <h2>{group.name}</h2>
            <p>Your group shell has been created. You are now the Team Leader.</p>
          </section>
        </section>
      )}

      {!group && !showForm && (
        <section className="panel">
          <button type="button" onClick={() => setShowForm(true)}>
            Create a New Group
          </button>
        </section>
      )}

      {showForm && (
        <section className="panel">
          <form className="form" onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span>Group Name</span>
              <input
                id="group-name"
                name="name"
                type="text"
                placeholder="e.g. AI Capstone Team"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={3}
                maxLength={64}
                required
                disabled={pending}
                aria-describedby={error ? 'group-name-error' : undefined}
                aria-invalid={error?.type === 'validation' ? 'true' : undefined}
              />
              {error && (
                <span id="group-name-error" className="field-error" role="alert">
                  {error.message}
                </span>
              )}
            </label>

            {error?.type === 'unexpected' && (
              <section className="feedback feedback-error" aria-live="polite">
                <p className="feedback-label">Error</p>
                <p>{error.message}</p>
              </section>
            )}

            <div className="form-actions">
              <button type="submit" disabled={pending}>
                {pending ? 'Creating group...' : 'Create Group'}
              </button>
              <button type="button" onClick={handleCancel} disabled={pending}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
