const { Group, IntegrationBinding, IntegrationTokenReference } = require('../models');
const {
  buildIntegrationResponse,
  canManageIntegrations,
} = require('./integrationBindingController');

async function getIntegrationConfiguration(req, res) {
  try {
    const normalizedTeamId = String(req.params.teamId || '').trim();
    const group = await Group.findByPk(normalizedTeamId);

    if (!group) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    if (!canManageIntegrations(group, req.user)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Only the team leader or authorized staff can view integrations for this team',
      });
    }

    const binding = await IntegrationBinding.findOne({
      where: { teamId: normalizedTeamId },
    });

    if (!binding) {
      return res.status(404).json({
        code: 'INTEGRATION_BINDING_NOT_FOUND',
        message: 'No integration binding exists for this team',
      });
    }

    const tokenReference = await IntegrationTokenReference.findByPk(normalizedTeamId);

    return res.status(200).json(buildIntegrationResponse(binding, tokenReference));
  } catch (error) {
    console.error('Error in getIntegrationConfiguration:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

module.exports = { getIntegrationConfiguration };
