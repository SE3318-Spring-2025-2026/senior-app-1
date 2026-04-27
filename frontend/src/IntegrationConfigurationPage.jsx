import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from './services/apiClient';

function buildProviderRows(configuration) {
  const configuredProviders = new Set(configuration.providerSet || []);

  return [
    {
      key: 'GITHUB',
      label: 'GitHub',
      configured: configuredProviders.has('GITHUB'),
      connected: configuredProviders.has('GITHUB') && Boolean(configuration.githubTokenRef),
    },
    {
      key: 'JIRA',
      label: 'JIRA',
      configured: configuredProviders.has('JIRA'),
      connected: configuredProviders.has('JIRA') && Boolean(configuration.jiraTokenRef),
    },
  ];
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
  const [loading, setLoading] = useState(true);
  const [configuration, setConfiguration] = useState(null);
  const [notConnected, setNotConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadConfiguration() {
      try {
        setLoading(true);
        setError('');
        setNotConnected(false);

        const { data } = await apiClient.get(`/v1/teams/${teamId}/integrations`);
        if (!isMounted) {
          return;
        }

        setConfiguration(data);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const code = loadError.response?.data?.code;
        if (code === 'INTEGRATION_BINDING_NOT_FOUND') {
          setConfiguration(null);
          setNotConnected(true);
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

  if (error) {
    return (
      <main className="page page-group-view">
        <div className="feedback feedback-error">
          <div className="feedback-label">error</div>
          <h2>Integration configuration unavailable</h2>
          <p>{error}</p>
        </div>
        <p className="back-link-wrap">
          <Link className="back-link" to="/students/groups/manage">Back to Group Management</Link>
        </p>
      </main>
    );
  }

  if (notConnected) {
    return (
      <main className="page page-group-view">
        <section className="hero group-page-header">
          <p className="eyebrow">Sprint Monitoring</p>
          <h1>Integration Configuration</h1>
          <p className="group-page-status">Team {teamId}</p>
        </section>

        <section className="group-details-card">
          <div className="feedback feedback-warning">
            <div className="feedback-label">not connected</div>
            <h2>No integration configured</h2>
            <p>This team does not have an active GitHub or JIRA integration binding yet.</p>
          </div>
        </section>

        <p className="back-link-wrap">
          <Link className="back-link" to="/students/groups/manage">Back to Group Management</Link>
        </p>
      </main>
    );
  }

  const providerRows = buildProviderRows(configuration);
  const missingProviders = providerRows.filter((provider) => !provider.configured).map((provider) => provider.label);
  const missingTokenProviders = providerRows
    .filter((provider) => provider.configured && !provider.connected)
    .map((provider) => provider.label);
  const displayStatus = getDisplayStatus(configuration);

  return (
    <main className="page page-group-view">
      <section className="hero group-page-header">
        <p className="eyebrow">Sprint Monitoring</p>
        <h1>Integration Configuration</h1>
        <p className="group-page-status">Team {configuration.teamId}</p>
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
              <strong>{(configuration.providerSet || []).join(', ') || 'None'}</strong>
            </div>
            <div className="group-summary-item">
              <span>Organization</span>
              <strong>{configuration.organizationName || 'Not configured'}</strong>
            </div>
            <div className="group-summary-item">
              <span>Repository</span>
              <strong>{configuration.repositoryName || 'Not configured'}</strong>
            </div>
            <div className="group-summary-item">
              <span>JIRA Project</span>
              <strong>{configuration.jiraProjectKey || 'Not configured'}</strong>
            </div>
            <div className="group-summary-item">
              <span>Default Branch</span>
              <strong>{configuration.defaultBranch || 'Not configured'}</strong>
            </div>
          </div>
        </div>

        {displayStatus === 'Partial' && (
          <div className="group-callout group-callout-warning">
            <strong>Partial integration detected.</strong>
            <p className="integration-warning-copy">
              {missingProviders.length > 0
                ? `Missing provider setup: ${missingProviders.join(', ')}.`
                : 'All providers are selected, but one or more token references are still missing.'}
            </p>
            {missingTokenProviders.length > 0 && (
              <p className="integration-warning-copy">
                Provider setup is incomplete for: {missingTokenProviders.join(', ')}.
              </p>
            )}
          </div>
        )}

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

      <p className="back-link-wrap">
        <Link className="back-link" to="/students/groups/manage">Back to Group Management</Link>
      </p>
    </main>
  );
}
