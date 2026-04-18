const { AdvisorRequest, Group, User } = require('../models');

/**
 * Get advisor request details by requestId
 * @param {number} requestId - The advisor request ID
 * @param {number} userId - The current user ID (for authorization check)
 * @returns {Promise<Object>} The advisor request details
 * @throws {Error} If request not found or user unauthorized
 */
async function getAdvisorRequestDetails(requestId, userId) {
  // Fetch the request with related data
  const request = await AdvisorRequest.findByPk(requestId, {
    include: [
      {
        model: Group,
        attributes: ['id', 'name', 'teamLeaderId'],
      },
      {
        model: User,
        as: 'advisor',
        attributes: ['id', 'email', 'fullName'],
      },
      {
        model: User,
        as: 'teamLeader',
        attributes: ['id', 'email', 'fullName'],
      },
    ],
  });

  if (!request) {
    const error = new Error('Advisor request not found');
    error.code = 'REQUEST_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Authorization check: Only the team leader can view the request
  if (request.teamLeaderId !== userId) {
    const error = new Error('You do not have permission to access this request');
    error.code = 'FORBIDDEN';
    error.statusCode = 403;
    throw error;
  }

  return {
    id: request.id,
    groupId: request.groupId,
    advisorId: request.advisorId,
    professorId: request.advisorId,
    teamLeaderId: request.teamLeaderId,
    status: request.status,
    decisionNote: request.decisionNote,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    // Optional: Include related data if needed
    group: request.Group,
    advisor: request.advisor,
    teamLeader: request.teamLeader,
  };
}

module.exports = {
  getAdvisorRequestDetails,
};
