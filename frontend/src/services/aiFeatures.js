import apiClient from './apiClient';

export async function triggerPrReviewVerification(teamId, sprintId) {
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/pr-review-verifications`, {});
}

export async function listPrReviewStatuses(teamId, sprintId) {
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/pr-review-verifications`);
}

export async function runAiValidation(teamId, sprintId, payload) {
  // payload: { issueKey, issueDescription, fileDiffs: [{path, diff}], prNumber? }
  return apiClient.post(`/v1/teams/${teamId}/sprints/${sprintId}/ai-validations`, payload);
}

export async function listAiValidations(teamId, sprintId) {
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/ai-validations`);
}

export async function getAiSignals(teamId, sprintId) {
  return apiClient.get(`/v1/teams/${teamId}/sprints/${sprintId}/ai-signals`);
}
