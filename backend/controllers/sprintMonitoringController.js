const { param, validationResult } = require('express-validator');
const {
  Group,
  IntegrationBinding,
  SprintStory,
  SprintPullRequest,
} = require('../models');

function canAccessMonitoring(group, user) {
  if (!user) {
    return false;
  }

  if (String(group.leaderId || '') === String(user.id)) {
    return true;
  }

  return ['ADMIN', 'COORDINATOR'].includes(String(user.role || '').toUpperCase());
}

const getSprintMonitoringSnapshotValidation = [
  param('teamId').isString().trim().notEmpty().withMessage('teamId is required'),
  param('sprintId').isString().trim().notEmpty().withMessage('sprintId is required'),
];

async function getSprintMonitoringSnapshot(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  try {
    const teamId = req.params.teamId.trim();
    const sprintId = req.params.sprintId.trim();

    const group = await Group.findByPk(teamId);
    if (!group) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    if (!canAccessMonitoring(group, req.user)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Only the team leader or authorized staff can view sprint monitoring data',
      });
    }

    const binding = await IntegrationBinding.findOne({
      where: { teamId },
    });
    if (!binding) {
      return res.status(404).json({
        code: 'INTEGRATION_BINDING_NOT_FOUND',
        message: 'No integration binding exists for this team',
      });
    }

    const [stories, pullRequests] = await Promise.all([
      SprintStory.findAll({
        where: { teamId, sprintId },
        order: [['issueKey', 'ASC']],
      }),
      SprintPullRequest.findAll({
        where: { teamId, sprintId },
        order: [['prNumber', 'ASC']],
      }),
    ]);

    const prsByIssueKey = new Map();
    for (const pullRequest of pullRequests) {
      const issueKey = pullRequest.relatedIssueKey || null;
      if (!issueKey) {
        continue;
      }
      const existing = prsByIssueKey.get(issueKey) || [];
      existing.push({
        prNumber: pullRequest.prNumber,
        branchName: pullRequest.branchName,
        title: pullRequest.title,
        prStatus: pullRequest.prStatus,
        mergeStatus: pullRequest.mergeStatus,
        url: pullRequest.url,
      });
      prsByIssueKey.set(issueKey, existing);
    }

    return res.status(200).json({
      teamId,
      sprintId,
      integration: {
        bindingId: binding.bindingId,
        providerSet: binding.providerSet,
        organizationName: binding.organizationName,
        repositoryName: binding.repositoryName,
        jiraWorkspaceId: binding.jiraWorkspaceId,
        jiraProjectKey: binding.jiraProjectKey,
        defaultBranch: binding.defaultBranch,
        status: binding.status,
      },
      stories: stories.map((story) => ({
        issueKey: story.issueKey,
        title: story.title,
        description: story.description,
        assigneeId: story.assigneeId,
        reporterId: story.reporterId,
        status: story.status,
        storyPoints: story.storyPoints,
        sourceCreatedAt: story.sourceCreatedAt,
        sourceUpdatedAt: story.sourceUpdatedAt,
        linkedPullRequests: prsByIssueKey.get(story.issueKey) || [],
      })),
      unlinkedPullRequests: pullRequests
        .filter((pullRequest) => !pullRequest.relatedIssueKey)
        .map((pullRequest) => ({
          prNumber: pullRequest.prNumber,
          branchName: pullRequest.branchName,
          title: pullRequest.title,
          prStatus: pullRequest.prStatus,
          mergeStatus: pullRequest.mergeStatus,
          changedFiles: pullRequest.changedFiles,
          diffSummary: pullRequest.diffSummary,
          sourceCreatedAt: pullRequest.sourceCreatedAt,
          sourceUpdatedAt: pullRequest.sourceUpdatedAt,
          sourceMergedAt: pullRequest.sourceMergedAt,
          url: pullRequest.url,
        })),
    });
  } catch (error) {
    console.error('Error in getSprintMonitoringSnapshot:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to load sprint monitoring snapshot',
    });
  }
}

module.exports = {
  getSprintMonitoringSnapshotValidation,
  getSprintMonitoringSnapshot,
};
