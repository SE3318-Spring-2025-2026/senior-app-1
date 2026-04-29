import apiClient from './apiClient';

export async function getSprintEvaluation(teamId, sprintId) {
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`);
}

export async function upsertSprintEvaluation(teamId, sprintId, payload) {
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`, payload);
}
