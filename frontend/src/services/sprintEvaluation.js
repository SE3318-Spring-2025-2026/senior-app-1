import apiClient from './apiClient';

<<<<<<< Persist-evaluation-results
export async function getSprintEvaluation(teamId, sprintId) {
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`);
}

export async function upsertSprintEvaluation(teamId, sprintId, payload) {
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`, payload);
=======
export async function triggerSprintEvaluation(teamId, sprintId, createdBy) {
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`, { createdBy });
}

export async function getSprintEvaluation(teamId, sprintId) {
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/evaluations`);
>>>>>>> main
}
