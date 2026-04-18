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

async function updatePendingAdvisorRequestStatus(req, res) {
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
          'Only the assigned advisor can update this request.',
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

    const nextStatus = String(req.body.status).toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(nextStatus)) {
      return res.status(400).json(
        buildErrorResponse(
          'Only APPROVED or REJECTED transitions are allowed for pending advisor requests.',
          'INVALID_STATUS_TRANSITION',
        ),
      );
    }

    await advisorRequest.update({
      status: nextStatus,
      decidedAt: new Date(),
    });

    return res.status(200).json({
      id: advisorRequest.id,
      groupId: advisorRequest.groupId,
      advisorId: advisorRequest.advisorId,
      teamLeaderId: advisorRequest.teamLeaderId,
      status: advisorRequest.status,
      note: advisorRequest.note,
      decidedAt: advisorRequest.decidedAt,
      updatedAt: advisorRequest.updatedAt,
    });
  } catch (error) {
    console.error('Error updating pending advisor request status:', error);
    return res.status(500).json(
      buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR'),
    );
  }
}

module.exports = { getPendingAdvisorRequest, updatePendingAdvisorRequestStatus };
