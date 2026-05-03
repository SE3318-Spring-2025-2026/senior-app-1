import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import apiClient from './services/apiClient';
import { getSprintMonitoringSnapshot } from './services/sprintMonitoring';

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

  if (configuration.status === 'INVALID') {
    return 'Invalid';
  }

  if (configuration.status === 'PENDING_REAUTH') {
    return 'Re-auth Required';
  }

  if (configuration.status === 'PARTIAL') {
    return 'Partial';
  }

  return 'Connected';
}

function getMonitoringWarnings(configuration) {
  if (!configuration) {
    return [];
  }

  if (configuration.status === 'PENDING_REAUTH') {
    return ['Integration requires re-authentication.'];
  }

  if (configuration.status === 'INVALID') {
    return ['Integration configuration looks invalid. Verify the repository, workspace, and project settings.'];
  }

  if (configuration.status !== 'PARTIAL') {
    return [];
  }

  const warnings = [];

  if (configuration.providerSet?.includes('JIRA') && !configuration.hasJiraTokenRef) {
    warnings.push('JIRA token missing.');
  }

  if (configuration.providerSet?.includes('GITHUB') && !configuration.hasGithubTokenRef) {
    warnings.push('GitHub token missing.');
  }

  if (!warnings.length) {
    warnings.push('Integration is partially configured.');
  }

  return warnings;
}

function flattenLinkedPullRequests(stories = []) {
  return stories.flatMap((story) => story.linkedPullRequests || []);
}

function buildMonitoringSummary(snapshot) {
  if (!snapshot) {
    return null;
  }

  const stories = Array.isArray(snapshot.stories) ? snapshot.stories : [];
  const linkedPullRequests = flattenLinkedPullRequests(stories);
  const unlinkedPullRequests = Array.isArray(snapshot.unlinkedPullRequests) ? snapshot.unlinkedPullRequests : [];
  const allPullRequests = [...linkedPullRequests, ...unlinkedPullRequests];

  const activeStories = stories.filter((story) => story.isActive !== false);
  const activePullRequests = allPullRequests.filter((pullRequest) => pullRequest.isActive !== false);
  const activeLinkedPullRequests = linkedPullRequests.filter((pullRequest) => pullRequest.isActive !== false);

  const lastSeenValues = [
    ...stories.map((story) => story.lastSeenAt).filter(Boolean),
    ...allPullRequests.map((pullRequest) => pullRequest.lastSeenAt).filter(Boolean),
  ];

  const latestSeenAt = lastSeenValues.reduce((currentLatest, candidate) => {
    if (!candidate) {
      return currentLatest;
    }

    if (!currentLatest) {
      return candidate;
    }

    return new Date(candidate).getTime() > new Date(currentLatest).getTime() ? candidate : currentLatest;
  }, '');

  return {
    lastSyncTime: latestSeenAt || '',
    activeStoryCount: activeStories.length,
    activePullRequestCount: activePullRequests.length,
    matchedPullRequestCount: activeLinkedPullRequests.length,
    mergedPullRequestCount: activeLinkedPullRequests.filter((pullRequest) => String(pullRequest.mergeStatus || '').toLowerCase() === 'merged').length,
    staleRecordCount: stories.filter((story) => story.isActive === false).length
      + allPullRequests.filter((pullRequest) => pullRequest.isActive === false).length,
  };
}

function formatDateTime(value) {
  if (!value) {
    return 'Not synced yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not synced yet';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function IntegrationConfigurationPage() {
  const { teamId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configuration, setConfiguration] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [monitoringSnapshot, setMonitoringSnapshot] = useState(null);
  const [monitoringError, setMonitoringError] = useState('');

  const selectedSprintId = searchParams.get('sprintId') || '';

  useEffect(() => {
    let isMounted = true;

    async function loadConfiguration() {
      try {
        setLoading(true);
        setError('');
        setSuccess('');
        setConfiguration(null);
        setForm({ ...EMPTY_FORM });

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

        setConfiguration(null);
        setForm({ ...EMPTY_FORM });
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

  useEffect(() => {
    let isMounted = true;

    async function loadMonitoringSummary() {
      if (!selectedSprintId) {
        setMonitoringSnapshot(null);
        setMonitoringError('');
        setMonitoringLoading(false);
        return;
      }

      try {
        setMonitoringLoading(true);
        setMonitoringError('');
        const { data } = await getSprintMonitoringSnapshot(teamId, selectedSprintId, { includeStale: true });
        if (!isMounted) {
          return;
        }

        setMonitoringSnapshot(data);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setMonitoringSnapshot(null);
        setMonitoringError(loadError.response?.data?.message || loadError.message || 'Failed to load monitoring summary.');
      } finally {
        if (isMounted) {
          setMonitoringLoading(false);
        }
      }
    }

    loadMonitoringSummary();

    return () => {
      isMounted = false;
    };
  }, [teamId, selectedSprintId]);

  async function refreshMonitoringSummary() {
    if (!selectedSprintId) {
      setMonitoringSnapshot(null);
      setMonitoringError('');
      return;
    }

    try {
      setMonitoringLoading(true);
      setMonitoringError('');
      const { data } = await getSprintMonitoringSnapshot(teamId, selectedSprintId, { includeStale: true });
      setMonitoringSnapshot(data);
    } catch (loadError) {
      setMonitoringSnapshot(null);
      setMonitoringError(loadError.response?.data?.message || loadError.message || 'Failed to load monitoring summary.');
    } finally {
      setMonitoringLoading(false);
    }
  }

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSprintIdChange(value) {
    const nextValue = value.trim();
    const nextParams = new URLSearchParams(searchParams);

    if (nextValue) {
      nextParams.set('sprintId', nextValue);
    } else {
      nextParams.delete('sprintId');
    }

    setSearchParams(nextParams, { replace: true });
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

      if (selectedSprintId) {
        await refreshMonitoringSummary();
      }
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
  const monitoringWarnings = getMonitoringWarnings(configuration);
  const monitoringSummary = buildMonitoringSummary(monitoringSnapshot);
  const hasMonitoringData = monitoringSummary
    ? (monitoringSummary.activeStoryCount + monitoringSummary.activePullRequestCount + monitoringSummary.staleRecordCount) > 0
    : false;

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

        <div className="group-details-summary">
          <h3>Monitoring Status / Sync Summary</h3>
          <label className="field">
            <span>Sprint ID</span>
            <input
              value={selectedSprintId}
              onChange={(event) => handleSprintIdChange(event.target.value)}
              placeholder="sprint_2026_03"
            />
          </label>

          {monitoringWarnings.length > 0 && (
            <div className="feedback feedback-error">
              <div className="feedback-label">warning</div>
              {monitoringWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {monitoringLoading && (
            <div className="feedback feedback-loading">
              <div className="feedback-label">loading</div>
              <p>Fetching monitoring summary for this sprint.</p>
            </div>
          )}

          {!monitoringLoading && monitoringError && (
            <div className="feedback feedback-error">
              <div className="feedback-label">error</div>
              <p>{monitoringError}</p>
            </div>
          )}

          {!monitoringLoading && !monitoringError && !selectedSprintId && (
            <div className="feedback">
              <div className="feedback-label">summary</div>
              <p>Enter a sprint ID to load monitoring visibility for this team.</p>
            </div>
          )}

          {!monitoringLoading && !monitoringError && selectedSprintId && !hasMonitoringData && (
            <div className="feedback">
              <div className="feedback-label">empty</div>
              <p>No monitoring data exists for this sprint yet.</p>
            </div>
          )}

          {!monitoringLoading && !monitoringError && selectedSprintId && hasMonitoringData && monitoringSummary && (
            <div className="group-summary-grid">
              <div className="group-summary-item">
                <span>Last Sync Time</span>
                <strong>{formatDateTime(monitoringSummary.lastSyncTime)}</strong>
              </div>
              <div className="group-summary-item">
                <span>Synced JIRA Stories</span>
                <strong>{monitoringSummary.activeStoryCount}</strong>
              </div>
              <div className="group-summary-item">
                <span>Synced GitHub PRs</span>
                <strong>{monitoringSummary.activePullRequestCount}</strong>
              </div>
              <div className="group-summary-item">
                <span>Matched PRs</span>
                <strong>{monitoringSummary.matchedPullRequestCount}</strong>
              </div>
              <div className="group-summary-item">
                <span>Merged PRs</span>
                <strong>{monitoringSummary.mergedPullRequestCount}</strong>
              </div>
              {monitoringSummary.staleRecordCount > 0 && (
                <div className="group-summary-item">
                  <span>Stale Records</span>
                  <strong>{monitoringSummary.staleRecordCount}</strong>
                </div>
              )}
            </div>
          )}
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
          <div className="group-callout group-callout-warning">
            <strong>GitHub and JIRA are both required.</strong>
            <p className="integration-warning-copy">
              This monitoring flow currently expects both providers to be configured together, so provider selection is fixed on this page.
            </p>
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
