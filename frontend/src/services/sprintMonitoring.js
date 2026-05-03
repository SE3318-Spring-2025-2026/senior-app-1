import apiClient from './apiClient';

export async function getSprintMonitoringSnapshot(teamId, sprintId, options = {}) {
  const params = new URLSearchParams();
  if (options.includeStale) {
    params.set('includeStale', 'true');
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/monitoring${suffix}`);
}
