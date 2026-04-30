const { Group, IntegrationBinding, IntegrationTokenReference } = require('../models');

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

    if (String(group.leaderId || '') !== String(req.user?.id)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Only the team leader can view integrations for this team',
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
    const hasGithubProvider = binding.providerSet.includes('GITHUB');
    const hasJiraProvider = binding.providerSet.includes('JIRA');
    const hasGithubTokenRef = Boolean(tokenReference?.githubTokenRef);
    const hasJiraTokenRef = Boolean(tokenReference?.jiraTokenRef);

    let integrationStatus = binding.status;
    if (
      (hasGithubProvider && !hasGithubTokenRef)
      || (hasJiraProvider && !hasJiraTokenRef)
    ) {
      integrationStatus = 'PARTIAL';
    }

    return res.status(200).json({
      bindingId: binding.bindingId,
      teamId: binding.teamId,
      providerSet: binding.providerSet,
      organizationName: binding.organizationName,
      repositoryName: binding.repositoryName,
      jiraProjectKey: binding.jiraProjectKey,
      jiraWorkspaceId: binding.jiraWorkspaceId,
      defaultBranch: binding.defaultBranch,
      status: integrationStatus,
      githubTokenRef: tokenReference?.githubTokenRef ?? null,
      jiraTokenRef: tokenReference?.jiraTokenRef ?? null,
      createdAt: binding.createdAt,
      lastUpdatedAt: tokenReference?.updatedAt ?? binding.updatedAt,
    });
  } catch (error) {
    console.error('Error in getIntegrationConfiguration:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

module.exports = { getIntegrationConfiguration };
