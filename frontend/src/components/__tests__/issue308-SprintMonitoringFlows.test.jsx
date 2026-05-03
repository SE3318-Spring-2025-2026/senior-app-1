import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import IntegrationConfigurationPage from '../../IntegrationConfigurationPage.jsx';
import apiClient from '../../services/apiClient';

jest.mock('../../services/apiClient');
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '42', role: 'STUDENT' },
  }),
}));

function renderIntegrationPage(teamId = 'team-1', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/students/groups/${teamId}/integrations${search}`]}>
      <Routes>
        <Route path="/students/groups/:teamId/integrations" element={<IntegrationConfigurationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderIntegrationPageSwitcher(initialTeamId = 'team-1') {
  function Harness() {
    return (
      <>
        <Link to="/students/groups/team-1/integrations">Team 1</Link>
        <Link to="/students/groups/team-2/integrations">Team 2</Link>
        <Routes>
          <Route path="/students/groups/:teamId/integrations" element={<IntegrationConfigurationPage />} />
        </Routes>
      </>
    );
  }

  return render(
    <MemoryRouter initialEntries={[`/students/groups/${initialTeamId}/integrations`]}>
      <Harness />
    </MemoryRouter>,
  );
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Sprint monitoring frontend flows (issue #308)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('integration configuration UI shows connected providers without exposing token references', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        bindingId: 'binding-1',
        teamId: 'team-1',
        providerSet: ['GITHUB', 'JIRA'],
        organizationName: 'acme-org',
        repositoryName: 'senior-app',
        jiraUserEmail: 'jira-owner@example.edu',
        jiraProjectKey: 'SPM',
        defaultBranch: 'main',
        status: 'ACTIVE',
        hasGithubTokenRef: true,
        hasJiraTokenRef: true,
      },
    });

    renderIntegrationPage('team-1');

    expect(await screen.findByRole('heading', { name: /integration configuration/i })).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('acme-org')).toBeInTheDocument();
    expect(screen.getByText('senior-app')).toBeInTheDocument();
    expect(screen.getByText('SPM')).toBeInTheDocument();
    expect(screen.getByText(/gitHub and jira are both required/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('vault://github/team-1')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('vault://jira/team-1')).not.toBeInTheDocument();
  });

  test('integration configuration UI shows monitoring sync summary for the resolved active sprint', async () => {
    apiClient.get
      .mockResolvedValueOnce({
        data: {
          bindingId: 'binding-1',
          teamId: 'team-1',
          providerSet: ['GITHUB', 'JIRA'],
          organizationName: 'acme-org',
          repositoryName: 'senior-app',
          jiraUserEmail: 'jira-owner@example.edu',
          jiraProjectKey: 'SPM',
          defaultBranch: 'main',
          status: 'ACTIVE',
          hasGithubTokenRef: true,
          hasJiraTokenRef: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          teamId: 'team-1',
          sprintId: 'sprint-42',
          resolvedSprint: {
            sprintId: 'sprint-42',
          },
          integration: {
            status: 'ACTIVE',
          },
          stories: [
            {
              issueKey: 'SPM-1',
              isActive: true,
              lastSeenAt: '2026-04-01T10:00:00.000Z',
              linkedPullRequests: [
                {
                  prNumber: 12,
                  mergeStatus: 'merged',
                  isActive: true,
                  lastSeenAt: '2026-04-01T10:05:00.000Z',
                },
              ],
            },
            {
              issueKey: 'SPM-2',
              isActive: true,
              lastSeenAt: '2026-04-01T09:00:00.000Z',
              linkedPullRequests: [
                {
                  prNumber: 15,
                  mergeStatus: 'open',
                  isActive: true,
                  lastSeenAt: '2026-04-01T09:10:00.000Z',
                },
              ],
            },
            {
              issueKey: 'SPM-3',
              isActive: false,
              lastSeenAt: '2026-03-31T11:00:00.000Z',
              linkedPullRequests: [],
            },
          ],
          unlinkedPullRequests: [
            {
              prNumber: 99,
              isActive: true,
              lastSeenAt: '2026-04-01T08:00:00.000Z',
            },
            {
              prNumber: 98,
              isActive: false,
              lastSeenAt: '2026-03-31T08:00:00.000Z',
            },
          ],
        },
      });

    renderIntegrationPage('team-1');

    expect(await screen.findByRole('heading', { name: /integration configuration/i })).toBeInTheDocument();
    expect(await screen.findByText(/monitoring status \/ sync summary/i)).toBeInTheDocument();
    expect(screen.getByText(/active sprint/i).closest('.group-summary-item')).toHaveTextContent('sprint-42');
    expect(screen.getByText(/synced jira stories/i).closest('.group-summary-item')).toHaveTextContent('2');
    expect(screen.getByText(/synced github prs/i).closest('.group-summary-item')).toHaveTextContent('3');
    expect(screen.getByText(/matched prs/i).closest('.group-summary-item')).toHaveTextContent('2');
    expect(screen.getByText(/merged prs/i).closest('.group-summary-item')).toHaveTextContent('1');
    expect(screen.getByText(/stale records/i).closest('.group-summary-item')).toHaveTextContent('2');
    expect(screen.getByText(/stale records/i)).toBeInTheDocument();
    expect(screen.getByText(/last sync time/i).closest('.group-summary-item')).toHaveTextContent(/Apr 2026/i);
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/v1/teams/team-1/monitoring/current?includeStale=true');
  });

  test('integration configuration UI shows loading and empty configuration states', async () => {
    const deferred = createDeferred();
    apiClient.get.mockReturnValueOnce(deferred.promise);

    renderIntegrationPage('team-2');

    expect(screen.getByText(/loading integrations/i)).toBeInTheDocument();

    deferred.reject({
      response: {
        data: {
          code: 'INTEGRATION_BINDING_NOT_FOUND',
          message: 'No integration binding exists for this team',
        },
      },
    });

    expect(await screen.findByRole('button', { name: /save configuration/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('main')).toBeInTheDocument();
    expect(screen.getByText(/provider selection is fixed on this page/i)).toBeInTheDocument();
  });

  test('integration configuration UI shows partial warning state and backend load failure', async () => {
    apiClient.get
      .mockResolvedValueOnce({
        data: {
          teamId: 'team-3',
          providerSet: ['GITHUB', 'JIRA'],
          organizationName: 'acme-org',
          repositoryName: 'senior-app',
          jiraUserEmail: 'jira-owner@example.edu',
          jiraProjectKey: 'SPM',
          status: 'PARTIAL',
          hasGithubTokenRef: true,
          hasJiraTokenRef: false,
        },
      })
      .mockRejectedValueOnce(new Error('Monitoring unavailable'))
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockRejectedValueOnce(new Error('Monitoring unavailable'));

    const { unmount } = renderIntegrationPage('team-3');

    expect(await screen.findByText(/configured but waiting for token reference/i)).toBeInTheDocument();

    unmount();
    renderIntegrationPage('team-4');

    expect(await screen.findByText(/api unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/api unavailable/i)).toBeInTheDocument();
  });

  test('integration configuration UI shows monitoring empty and error states', async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === '/v1/teams/team-5/integrations') {
        return Promise.resolve({
          data: {
            teamId: 'team-5',
            providerSet: ['GITHUB', 'JIRA'],
            organizationName: 'acme-org',
            repositoryName: 'senior-app',
            jiraUserEmail: 'jira-owner@example.edu',
            jiraProjectKey: 'SPM',
            status: 'PARTIAL',
            hasGithubTokenRef: true,
            hasJiraTokenRef: false,
          },
        });
      }

      if (url === '/v1/teams/team-5/monitoring/current?includeStale=true') {
        return Promise.resolve({
          data: {
            teamId: 'team-5',
            sprintId: 'sprint-empty',
            resolvedSprint: {
              sprintId: 'sprint-empty',
            },
            stories: [],
            unlinkedPullRequests: [],
          },
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    const { unmount } = renderIntegrationPage('team-5');

    expect(await screen.findByText(/no monitoring data exists for the active sprint yet/i)).toBeInTheDocument();

    unmount();

    apiClient.get.mockReset();
    apiClient.get.mockImplementation((url) => {
      if (url === '/v1/teams/team-6/integrations') {
        return Promise.resolve({
          data: {
            teamId: 'team-6',
            providerSet: ['GITHUB', 'JIRA'],
            organizationName: 'acme-org',
            repositoryName: 'senior-app',
            jiraUserEmail: 'jira-owner@example.edu',
            jiraProjectKey: 'SPM',
            status: 'ACTIVE',
            hasGithubTokenRef: true,
            hasJiraTokenRef: true,
          },
        });
      }

      if (url === '/v1/teams/team-6/monitoring/current?includeStale=true') {
        return Promise.reject(new Error('Monitoring unavailable'));
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    renderIntegrationPage('team-6');

    expect(await screen.findByText(/monitoring unavailable/i)).toBeInTheDocument();
  });

  test('integration configuration UI clears stale team data when a new team load fails', async () => {
    const user = userEvent.setup();
    apiClient.get.mockImplementation((url) => {
      if (url === '/v1/teams/team-1/integrations') {
        return Promise.resolve({
          data: {
            teamId: 'team-1',
            providerSet: ['GITHUB', 'JIRA'],
            organizationName: 'acme-org',
            repositoryName: 'senior-app',
            jiraUserEmail: 'jira-owner@example.edu',
            jiraProjectKey: 'SPM',
            defaultBranch: 'main',
            status: 'ACTIVE',
            hasGithubTokenRef: true,
            hasJiraTokenRef: true,
          },
        });
      }

      if (url === '/v1/teams/team-1/monitoring/current?includeStale=true') {
        return Promise.reject(new Error('Monitoring unavailable'));
      }

      if (url === '/v1/teams/team-2/integrations') {
        return Promise.reject(new Error('API unavailable'));
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    renderIntegrationPageSwitcher('team-1');

    expect(await screen.findByText('acme-org')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /team 2/i }));

    expect(await screen.findByText(/api unavailable/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('acme-org')).not.toBeInTheDocument();
    });
  });

  test('integration configuration form saves monitoring settings from the same page', async () => {
    const user = userEvent.setup();
    apiClient.get
      .mockRejectedValueOnce({
        response: {
          data: {
            code: 'INTEGRATION_BINDING_NOT_FOUND',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          teamId: 'team-9',
          sprintId: 'sprint-42',
          resolvedSprint: {
            sprintId: 'sprint-42',
          },
          stories: [],
          unlinkedPullRequests: [],
        },
      });
    apiClient.post.mockResolvedValueOnce({
      data: {
        bindingId: 'binding-2',
        teamId: 'team-9',
        providerSet: ['GITHUB', 'JIRA'],
        organizationName: 'acme-org',
        repositoryName: 'senior-app',
        jiraWorkspaceId: 'workspace-acme',
        jiraUserEmail: 'jira-owner@example.edu',
        jiraProjectKey: 'SPM',
        defaultBranch: 'main',
        status: 'ACTIVE',
        hasGithubTokenRef: true,
        hasJiraTokenRef: true,
      },
    });

    renderIntegrationPage('team-9');

    await screen.findByRole('button', { name: /save configuration/i });
    await user.clear(screen.getByLabelText(/gitHub organization/i));
    await user.type(screen.getByLabelText(/gitHub organization/i), 'acme-org');
    await user.clear(screen.getByLabelText(/^repository$/i));
    await user.type(screen.getByLabelText(/^repository$/i), 'senior-app');
    await user.clear(screen.getByLabelText(/jira workspace/i));
    await user.type(screen.getByLabelText(/jira workspace/i), 'workspace-acme');
    await user.clear(screen.getByLabelText(/jira user email/i));
    await user.type(screen.getByLabelText(/jira user email/i), 'jira-owner@example.edu');
    await user.clear(screen.getByLabelText(/jira project key/i));
    await user.type(screen.getByLabelText(/jira project key/i), 'SPM');
    await user.clear(screen.getByLabelText(/gitHub token reference/i));
    await user.type(screen.getByLabelText(/gitHub token reference/i), 'vault://github/team-9');
    await user.clear(screen.getByLabelText(/jira token reference/i));
    await user.type(screen.getByLabelText(/jira token reference/i), 'vault://jira/team-9');
    await user.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/v1/teams/team-9/integrations', {
        providerSet: ['GITHUB', 'JIRA'],
        organizationName: 'acme-org',
        repositoryName: 'senior-app',
        jiraWorkspaceId: 'workspace-acme',
        jiraUserEmail: 'jira-owner@example.edu',
        jiraProjectKey: 'SPM',
        defaultBranch: 'main',
        githubTokenRef: 'vault://github/team-9',
        jiraTokenRef: 'vault://jira/team-9',
        initiatedBy: '42',
      });
    });

    expect(await screen.findByText(/integration settings saved successfully/i)).toBeInTheDocument();
    expect(screen.getAllByText(/connected/i).length).toBeGreaterThan(0);
  });
});
