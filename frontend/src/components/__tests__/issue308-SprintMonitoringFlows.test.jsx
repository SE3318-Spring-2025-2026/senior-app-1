import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IntegrationConfigurationPage from '../../IntegrationConfigurationPage.jsx';
import apiClient from '../../services/apiClient';

jest.mock('../../services/apiClient');
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '42', role: 'STUDENT' },
  }),
}));

function renderIntegrationPage(teamId = 'team-1') {
  return render(
    <MemoryRouter initialEntries={[`/students/groups/${teamId}/integrations`]}>
      <Routes>
        <Route path="/students/groups/:teamId/integrations" element={<IntegrationConfigurationPage />} />
      </Routes>
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
    expect(screen.queryByDisplayValue('vault://github/team-1')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('vault://jira/team-1')).not.toBeInTheDocument();
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
  });

  test('integration configuration UI shows partial warning state and backend load failure', async () => {
    apiClient.get
      .mockResolvedValueOnce({
        data: {
          teamId: 'team-3',
          providerSet: ['GITHUB', 'JIRA'],
          organizationName: 'acme-org',
          repositoryName: 'senior-app',
          jiraProjectKey: 'SPM',
          status: 'PARTIAL',
          hasGithubTokenRef: true,
          hasJiraTokenRef: false,
        },
      })
      .mockRejectedValueOnce(new Error('API unavailable'));

    const { unmount } = renderIntegrationPage('team-3');

    expect(await screen.findByText(/configured but waiting for token reference/i)).toBeInTheDocument();

    unmount();
    renderIntegrationPage('team-4');

    expect(await screen.findByText(/api unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/api unavailable/i)).toBeInTheDocument();
  });

  test('integration configuration form saves monitoring settings from the same page', async () => {
    const user = userEvent.setup();
    apiClient.get.mockRejectedValueOnce({
      response: {
        data: {
          code: 'INTEGRATION_BINDING_NOT_FOUND',
        },
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
