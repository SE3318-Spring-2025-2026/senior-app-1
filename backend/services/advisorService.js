const { AdvisorRequest, Group, User } = require('../models');

/**
 * Get advisor request details by requestId
 * @param {number} requestId - The advisor request ID
 * @param {number} userId - The current user ID (for authorization check)
 * @returns {Promise<Object>} The advisor request details
 * @throws {Error} If request not found or user unauthorized
 */
async function getAdvisorRequestDetails(requestId, userId) {
  const request = await AdvisorRequest.findByPk(requestId);

  if (!request) {
    const error = new Error('Advisor request not found');
    error.code = 'REQUEST_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const group = await Group.findByPk(request.groupId, {
    attributes: ['id', 'name', 'leaderId'],
  });

  const advisor = await User.findByPk(request.advisorId, {
    attributes: ['id', 'email', 'fullName'],
  });

  const teamLeader = request.teamLeaderId
    ? await User.findByPk(request.teamLeaderId, {
      attributes: ['id', 'email', 'fullName'],
    })
    : null;

  // Authorization check: Only the team leader can view the request
  const ownerId = request.teamLeaderId ?? group?.leaderId;
  if (!ownerId || String(ownerId) !== String(userId)) {
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
    decisionNote: request.note,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    // Optional: Include related data if needed
    group,
    advisor,
    teamLeader,
  };
}

module.exports = {
  getAdvisorRequestDetails,
};
