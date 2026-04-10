const { processResponse } = require('../services/invitationService');

async function respondToInvitation(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    const invitation = await processResponse(Number(id), status);
    return res.status(200).json(invitation);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = { respondToInvitation };