const { processDecision } = require('../services/advisorRequestService');

const AdvisorRequest = require('../models/AdvisorRequest');

// PATCH /api/v1/advisor-requests/:requestId/decision
async function patchDecision(req, res) {
  try {
    const { decision, note } = req.body;
    const { requestId } = req.params;
    const userId = req.user.id; // Auth middleware must set req.user
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }
    const result = await processDecision({ requestId, decision, note, userId });
    res.json({ success: true, advisorRequest: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { patchDecision };

// GET /api/v1/advisor-requests?status=PENDING
async function listAdvisorRequests(req, res) {
  try {
    const status = req.query.status || 'PENDING';
    const advisorId = req.user.id;
    const requests = await AdvisorRequest.findAll({
      where: { status, advisorId },
      order: [['createdAt', 'DESC']],
    });
    res.json(requests);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports.listAdvisorRequests = listAdvisorRequests;
