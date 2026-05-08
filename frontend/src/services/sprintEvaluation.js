import apiClient from './apiClient';

export async function triggerSprintEvaluation(teamId, sprintId, createdBy) {
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`, { createdBy });
}

export async function getSprintEvaluation(teamId, sprintId) {
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`);
}
