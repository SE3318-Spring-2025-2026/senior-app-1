const { AdvisorRequest } = require('../models');

const buildErrorResponse = (message, code) => ({
  message,
  code,
});

async function getPendingAdvisorRequest(req, res) {
  try {
    const advisorRequest = await AdvisorRequest.findByPk(req.params.requestId);

    if (!advisorRequest) {
      return res.status(404).json(
        buildErrorResponse('Advisor request not found.', 'REQUEST_NOT_FOUND'),
      );
    }

    if (String(advisorRequest.advisorId) !== String(req.user.id)) {
      return res.status(403).json(
        buildErrorResponse(
          'Only the assigned advisor can access this request.',
          'FORBIDDEN',
        ),
      );
    }

    if (advisorRequest.status !== 'PENDING') {
      return res.status(400).json(
        buildErrorResponse(
          'Advisor request is not pending.',
          'REQUEST_NOT_PENDING',
        ),
      );
    }

    return res.status(200).json({
      id: advisorRequest.id,
      groupId: advisorRequest.groupId,
      advisorId: advisorRequest.advisorId,
      teamLeaderId: advisorRequest.teamLeaderId,
      status: advisorRequest.status,
      note: advisorRequest.note,
      decidedAt: advisorRequest.decidedAt,
      createdAt: advisorRequest.createdAt,
      updatedAt: advisorRequest.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching pending advisor request:', error);
    return res.status(500).json(
      buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR'),
    );
  }
}

module.exports = { getPendingAdvisorRequest };
