import apiClient from './apiClient';

export async function triggerJiraSync(teamId, sprintId, requestedBy, options = {}) {
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/jira-sync`, {
    requestedBy: String(requestedBy),
    boardId: options.boardId || 'demo-board',
    includeStatuses: options.includeStatuses,
  });
}

export async function triggerGitHubVerification(teamId, sprintId, requestedBy, options = {}) {
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/github-verifications`, {
    requestedBy: String(requestedBy),
    branchNames: options.branchNames || [],
    relatedIssueKeys: options.relatedIssueKeys || ['DEMO-1'],
  });
}

export async function getSprintMonitoringSnapshot(teamId, sprintId, options = {}) {
  const params = new URLSearchParams();
  if (options.includeStale) {
    params.set('includeStale', 'true');
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/monitoring${suffix}`);
}

export async function getCurrentSprintMonitoringSnapshot(teamId, options = {}) {
  const params = new URLSearchParams();
  if (options.includeStale) {
    params.set('includeStale', 'true');
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return apiClient.get(`/v1/teams/${teamId}/monitoring/current${suffix}`);
}
