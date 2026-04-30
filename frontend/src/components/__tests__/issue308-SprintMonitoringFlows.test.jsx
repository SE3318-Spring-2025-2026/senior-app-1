import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IntegrationConfigurationPage from '../../IntegrationConfigurationPage.jsx';
import SprintEvaluationPage from '../../SprintEvaluationPage.jsx';
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

function renderSprintEvaluationPage(teamId = 'team-1') {
  return render(
    <MemoryRouter initialEntries={[`/students/groups/${teamId}/sprints/evaluation`]}>
      <Routes>
        <Route path="/students/groups/:teamId/sprints/evaluation" element={<SprintEvaluationPage />} />
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
        githubTokenRef: 'vault://github/team-1',
        jiraTokenRef: 'vault://jira/team-1',
      },
    });

    renderIntegrationPage('team-1');

    expect(await screen.findByRole('heading', { name: /integration configuration/i })).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('acme-org')).toBeInTheDocument();
    expect(screen.getByText('senior-app')).toBeInTheDocument();
    expect(screen.getByText('SPM')).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('vault://github/team-1')).not.toBeInTheDocument();
    expect(screen.queryByText('vault://jira/team-1')).not.toBeInTheDocument();
  });

  test('integration configuration UI shows loading and not connected states', async () => {
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

    expect(await screen.findByText(/no integration configured/i)).toBeInTheDocument();
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
  });

  test('integration configuration UI shows partial warning and error state', async () => {
    apiClient.get
      .mockResolvedValueOnce({
        data: {
          teamId: 'team-3',
          providerSet: ['GITHUB', 'JIRA'],
          organizationName: 'acme-org',
          repositoryName: 'senior-app',
          jiraProjectKey: 'SPM',
          status: 'PARTIAL',
          githubTokenRef: 'vault://github/team-3',
          jiraTokenRef: null,
        },
      })
      .mockRejectedValueOnce(new Error('API unavailable'));

    const { unmount } = renderIntegrationPage('team-3');

    expect(await screen.findByText(/partial integration detected/i)).toBeInTheDocument();
    expect(screen.getByText(/provider setup is incomplete for: JIRA/i)).toBeInTheDocument();

    unmount();
    renderIntegrationPage('team-4');

    expect(await screen.findByText(/integration configuration unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/api unavailable/i)).toBeInTheDocument();
  });

  test('sprint evaluation form validates required fields before submission', async () => {
    const user = userEvent.setup();
    renderSprintEvaluationPage('team-1');

    await user.click(screen.getByRole('button', { name: /create evaluation/i }));

    expect(await screen.findByText(/required information missing/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('sprint evaluation flow shows success state without a page refresh', async () => {
    const user = userEvent.setup();
    apiClient.post.mockResolvedValueOnce({
      data: {
        evaluationId: 'eval-1',
        teamId: 'team-1',
        sprintId: 'sprint-2026-03',
        status: 'COMPLETED',
        createdAt: '2026-04-27T12:00:00Z',
      },
    });

    renderSprintEvaluationPage('team-1');

    await user.type(screen.getByLabelText(/sprint id/i), 'sprint-2026-03');
    await user.type(screen.getByLabelText(/aggregated score/i), '86.2');
    await user.type(screen.getByLabelText(/completion rate/i), '0.84');
    await user.type(screen.getByLabelText(/grading summary/i), 'Evaluation completed successfully.');
    await user.click(screen.getByRole('button', { name: /create evaluation/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/v1/teams/team-1/sprints/sprint-2026-03/evaluations', {
        aggregatedScore: 86.2,
        completionRate: 0.84,
        createdBy: '42',
        gradingSummary: 'Evaluation completed successfully.',
      });
    });

    expect(await screen.findByText(/sprint evaluation created/i)).toBeInTheDocument();
    expect(screen.getByText(/eval-1/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create sprint evaluation/i })).toBeInTheDocument();
  });

  test('sprint evaluation flow shows backend failure state', async () => {
    const user = userEvent.setup();
    apiClient.post.mockRejectedValueOnce({
      response: {
        data: {
          message: 'No integration binding exists for this team',
        },
      },
    });

    renderSprintEvaluationPage('team-1');

    await user.type(screen.getByLabelText(/sprint id/i), 'sprint-2026-04');
    await user.type(screen.getByLabelText(/aggregated score/i), '70');
    await user.type(screen.getByLabelText(/completion rate/i), '0.7');
    await user.click(screen.getByRole('button', { name: /create evaluation/i }));

    expect(await screen.findByText(/evaluation could not be created/i)).toBeInTheDocument();
    expect(screen.getByText(/no integration binding exists for this team/i)).toBeInTheDocument();
  });
});
