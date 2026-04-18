const { AdvisorRequest } = require('../models');
const { processDecision } = require('../services/advisorRequestService');

const buildErrorResponse = (message, code) => ({
  message,
  code,
});

// 1. Tekil İstek Getirme (Ana daldan gelen güvenlikli yapı)
async function getPendingAdvisorRequest(req, res) {
  try {
    const advisorRequest = await AdvisorRequest.findByPk(req.params.requestId);

    if (!advisorRequest) {
      return res.status(404).json(
        buildErrorResponse('Advisor request not found.', 'REQUEST_NOT_FOUND')
      );
    }

    if (String(advisorRequest.advisorId) !== String(req.user.id)) {
      return res.status(403).json(
        buildErrorResponse('Only the assigned advisor can access this request.', 'FORBIDDEN')
      );
    }

    if (advisorRequest.status !== 'PENDING') {
      return res.status(400).json(
        buildErrorResponse('Advisor request is not pending.', 'REQUEST_NOT_PENDING')
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
      buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR')
    );
  }
}

// 2. Çoğul İstekleri Listeleme (Senin dalından gelen)
async function listAdvisorRequests(req, res) {
  try {
    const status = req.query.status || 'PENDING';
    const advisorId = req.user.id;
    const requests = await AdvisorRequest.findAll({
      where: { status, advisorId },
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).json(requests);
  } catch (error) {
    console.error('Error fetching list of advisor requests:', error);
    return res.status(500).json(
      buildErrorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR')
    );
  }
}

// 3. Güncelleme İşlemi (Ana dalın güvenlik kontrolleri + Senin Transaction servisin)
async function updatePendingAdvisorRequestStatus(req, res) {
  try {
    const { requestId } = req.params;
    const advisorRequest = await AdvisorRequest.findByPk(requestId);

    if (!advisorRequest) {
      return res.status(404).json(
        buildErrorResponse('Advisor request not found.', 'REQUEST_NOT_FOUND')
      );
    }

    if (String(advisorRequest.advisorId) !== String(req.user.id)) {
      return res.status(403).json(
        buildErrorResponse('Only the assigned advisor can update this request.', 'FORBIDDEN')
      );
    }

    if (advisorRequest.status !== 'PENDING') {
      return res.status(400).json(
        buildErrorResponse('Advisor request is not pending.', 'REQUEST_NOT_PENDING')
      );
    }

    // Hem senin 'decision' hem de ana dalın 'status' isimlendirmesini destekler
    const rawDecision = req.body.status || req.body.decision;
    if (!rawDecision) {
      return res.status(400).json(
        buildErrorResponse('Decision/Status is required.', 'MISSING_FIELD')
      );
    }

    const nextStatus = String(rawDecision).toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(nextStatus)) {
      return res.status(400).json(
        buildErrorResponse('Only APPROVED or REJECTED transitions are allowed.', 'INVALID_STATUS_TRANSITION')
      );
    }

    // Transaction ve Service mantığın burada çalışıyor
    const result = await processDecision({
      requestId: requestId,
      decision: nextStatus,
      note: req.body.note, 
      userId: req.user.id
    });

    return res.status(200).json({ success: true, advisorRequest: result });

  } catch (error) {
    console.error('Error updating pending advisor request status:', error);
    return res.status(500).json(
      buildErrorResponse(error.message || 'Internal Server Error', 'INTERNAL_SERVER_ERROR')
    );
  }
}

// Tüm fonksiyonlar temiz bir şekilde tek bir yerden dışa aktarılıyor
module.exports = { 
  getPendingAdvisorRequest, 
  listAdvisorRequests, 
  updatePendingAdvisorRequestStatus 
};