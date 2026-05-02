import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import apiClient from './services/apiClient';

const EMPTY_FORM = {
  providerSet: ['GITHUB', 'JIRA'],
  organizationName: '',
  repositoryName: '',
  jiraWorkspaceId: '',
  jiraProjectKey: '',
  defaultBranch: 'main',
  githubTokenRef: '',
  jiraTokenRef: '',
};

function buildProviderRows(configuration) {
  const configuredProviders = new Set(configuration?.providerSet || []);

  return [
    {
      key: 'GITHUB',
      label: 'GitHub',
      configured: configuredProviders.has('GITHUB'),
      connected: configuredProviders.has('GITHUB') && Boolean(configuration?.hasGithubTokenRef),
    },
    {
      key: 'JIRA',
      label: 'JIRA',
      configured: configuredProviders.has('JIRA'),
      connected: configuredProviders.has('JIRA') && Boolean(configuration?.hasJiraTokenRef),
    },
  ];
}

function buildFormState(configuration) {
  if (!configuration) {
    return { ...EMPTY_FORM };
  }

  return {
    providerSet: Array.isArray(configuration.providerSet) && configuration.providerSet.length > 0
      ? configuration.providerSet
      : EMPTY_FORM.providerSet,
    organizationName: configuration.organizationName || '',
    repositoryName: configuration.repositoryName || '',
    jiraWorkspaceId: configuration.jiraWorkspaceId || '',
    jiraProjectKey: configuration.jiraProjectKey || '',
    defaultBranch: configuration.defaultBranch || 'main',
    githubTokenRef: '',
    jiraTokenRef: '',
  };
}

function getDisplayStatus(configuration) {
  if (!configuration) {
    return 'Not Connected';
  }

  if (configuration.status === 'PARTIAL') {
    return 'Partial';
  }

  return 'Connected';
}

export default function IntegrationConfigurationPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configuration, setConfiguration] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadConfiguration() {
      try {
        setLoading(true);
        setError('');
        setSuccess('');

        const { data } = await apiClient.get(`/v1/teams/${teamId}/integrations`);
        if (!isMounted) {
          return;
        }

        setConfiguration(data);
        setForm(buildFormState(data));
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const code = loadError.response?.data?.code;
        if (code === 'INTEGRATION_BINDING_NOT_FOUND') {
          setConfiguration(null);
          setForm({ ...EMPTY_FORM });
          return;
        }

        setError(loadError.response?.data?.message || loadError.message || 'Failed to load integration configuration.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadConfiguration();

    return () => {
      isMounted = false;
    };
  }, [teamId]);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function toggleProvider(provider) {
    setForm((current) => {
      const providerSet = new Set(current.providerSet);
      if (providerSet.has(provider)) {
        providerSet.delete(provider);
      } else {
        providerSet.add(provider);
      }

      return {
        ...current,
        providerSet: Array.from(providerSet),
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user?.id) {
      setError('You must be signed in to update integration settings.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        providerSet: form.providerSet,
        organizationName: form.organizationName,
        repositoryName: form.repositoryName,
        jiraWorkspaceId: form.jiraWorkspaceId || undefined,
        jiraProjectKey: form.jiraProjectKey,
        defaultBranch: form.defaultBranch || undefined,
        githubTokenRef: form.githubTokenRef || undefined,
        jiraTokenRef: form.jiraTokenRef || undefined,
        initiatedBy: String(user.id),
      };

      const request = configuration
        ? apiClient.put(`/v1/teams/${teamId}/integrations`, payload)
        : apiClient.post(`/v1/teams/${teamId}/integrations`, payload);
      const { data } = await request;
      setConfiguration(data);
      setForm(buildFormState(data));
      setSuccess('Integration settings saved successfully.');
    } catch (saveError) {
      setError(saveError.response?.data?.message || saveError.message || 'Failed to save integration settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-group-view">
        <div className="feedback feedback-loading">
          <div className="feedback-label">loading</div>
          <h2>Loading integrations</h2>
          <p>Fetching the current integration configuration for this team.</p>
        </div>
      </main>
    );
  }

  const providerRows = buildProviderRows(configuration);
  const displayStatus = getDisplayStatus(configuration);

  return (
    <main className="page page-group-view">
      <section className="hero group-page-header">
        <p className="eyebrow">Sprint Monitoring</p>
        <h1>Integration Configuration</h1>
        <p className="group-page-status">Team {teamId}</p>
      </section>

      <section className="group-details-card">
        <div className="group-details-summary">
          <h3>Configuration Summary</h3>
          <div className="group-summary-grid">
            <div className="group-summary-item">
              <span>Status</span>
              <strong>{displayStatus}</strong>
            </div>
            <div className="group-summary-item">
              <span>Providers</span>
              <strong>{(configuration?.providerSet || []).join(', ') || 'Not configured'}</strong>
            </div>
            <div className="group-summary-item">
              <span>Organization</span>
              <strong>{configuration?.organizationName || 'Not configured'}</strong>
            </div>
            <div className="group-summary-item">
              <span>Repository</span>
              <strong>{configuration?.repositoryName || 'Not configured'}</strong>
            </div>
            <div className="group-summary-item">
              <span>JIRA Project</span>
              <strong>{configuration?.jiraProjectKey || 'Not configured'}</strong>
            </div>
            <div className="group-summary-item">
              <span>Default Branch</span>
              <strong>{configuration?.defaultBranch || 'Not configured'}</strong>
            </div>
          </div>
        </div>

        <div>
          <h3>Provider Status</h3>
          <div className="group-directory-members">
            {providerRows.map((provider) => (
              <article key={provider.key} className="group-member-row">
                <div>
                  <strong>{provider.label}</strong>
                  <span>
                    {!provider.configured
                      ? 'Not configured'
                      : provider.connected
                        ? 'Connected'
                        : 'Configured but waiting for token reference'}
                  </span>
                </div>
                <div className="group-member-actions">
                  <span className="member-role-badge">
                    {!provider.configured ? 'Missing' : provider.connected ? 'Connected' : 'Partial'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="group-details-card">
        <h3>{configuration ? 'Update integration settings' : 'Create integration settings'}</h3>
        <p className="token-note">
          Store secure token references only. Raw token values should never be entered here.
        </p>

        {error && (
          <div className="feedback feedback-error">
            <div className="feedback-label">error</div>
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="feedback feedback-success">
            <div className="feedback-label">saved</div>
            <p>{success}</p>
          </div>
        )}

        <form className="form" onSubmit={handleSubmit}>
          <div className="group-directory-members">
            {['GITHUB', 'JIRA'].map((provider) => (
              <label key={provider} className="group-member-row">
                <div>
                  <strong>{provider}</strong>
                  <span>Enable {provider} monitoring for this team</span>
                </div>
                <input
                  type="checkbox"
                  checked={form.providerSet.includes(provider)}
                  onChange={() => toggleProvider(provider)}
                />
              </label>
            ))}
          </div>

          <label className="field">
            <span>GitHub organization</span>
            <input
              value={form.organizationName}
              onChange={(event) => updateField('organizationName', event.target.value)}
              placeholder="acme-org"
            />
          </label>

          <label className="field">
            <span>Repository</span>
            <input
              value={form.repositoryName}
              onChange={(event) => updateField('repositoryName', event.target.value)}
              placeholder="senior-app-1"
            />
          </label>

          <label className="field">
            <span>JIRA workspace</span>
            <input
              value={form.jiraWorkspaceId}
              onChange={(event) => updateField('jiraWorkspaceId', event.target.value)}
              placeholder="workspace-acme"
            />
          </label>

          <label className="field">
            <span>JIRA project key</span>
            <input
              value={form.jiraProjectKey}
              onChange={(event) => updateField('jiraProjectKey', event.target.value)}
              placeholder="SPM"
            />
          </label>

          <label className="field">
            <span>Default branch</span>
            <input
              value={form.defaultBranch}
              onChange={(event) => updateField('defaultBranch', event.target.value)}
              placeholder="main"
            />
          </label>

          <label className="field">
            <span>GitHub token reference</span>
            <input
              value={form.githubTokenRef}
              onChange={(event) => updateField('githubTokenRef', event.target.value)}
              placeholder="vault://github/team-1"
            />
          </label>

          <label className="field">
            <span>JIRA token reference</span>
            <input
              value={form.jiraTokenRef}
              onChange={(event) => updateField('jiraTokenRef', event.target.value)}
              placeholder="vault://jira/team-1"
            />
          </label>

          <div className="invite-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : configuration ? 'Update Configuration' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </section>

      <p className="back-link-wrap">
        <Link className="back-link" to="/students/groups/manage">Back to Group Management</Link>
      </p>
    </main>
  );
}
