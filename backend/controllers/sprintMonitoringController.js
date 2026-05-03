const { param, query, validationResult } = require('express-validator');
const {
  Group,
  IntegrationBinding,
  IntegrationTokenReference,
  SprintStory,
  SprintPullRequest,
} = require('../models');
const {
  buildIntegrationResponse,
  canManageIntegrations,
} = require('./integrationBindingController');

const getSprintMonitoringSnapshotValidation = [
  param('teamId').isString().trim().notEmpty().withMessage('teamId is required'),
  param('sprintId').isString().trim().notEmpty().withMessage('sprintId is required'),
  query('includeStale')
    .optional()
    .isBoolean()
    .withMessage('includeStale must be a boolean'),
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
    const includeStale = String(req.query.includeStale || '').toLowerCase() === 'true';

    const group = await Group.findByPk(teamId);
    if (!group) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    if (!canManageIntegrations(group, req.user)) {
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

    const tokenReference = await IntegrationTokenReference.findByPk(teamId);

    const [stories, pullRequests] = await Promise.all([
      SprintStory.findAll({
        where: {
          teamId,
          sprintId,
          ...(includeStale ? {} : { isActive: true }),
        },
        order: [['issueKey', 'ASC']],
      }),
      SprintPullRequest.findAll({
        where: {
          teamId,
          sprintId,
          ...(includeStale ? {} : { isActive: true }),
        },
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
        isActive: pullRequest.isActive,
        lastSeenAt: pullRequest.lastSeenAt,
        staleAt: pullRequest.staleAt,
        url: pullRequest.url,
      });
      prsByIssueKey.set(issueKey, existing);
    }

    return res.status(200).json({
      teamId,
      sprintId,
      integration: buildIntegrationResponse(binding, tokenReference),
      stories: stories.map((story) => ({
        issueKey: story.issueKey,
        title: story.title,
        description: story.description,
        assigneeId: story.assigneeId,
        reporterId: story.reporterId,
        status: story.status,
        storyPoints: story.storyPoints,
        isActive: story.isActive,
        lastSeenAt: story.lastSeenAt,
        staleAt: story.staleAt,
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
          isActive: pullRequest.isActive,
          lastSeenAt: pullRequest.lastSeenAt,
          staleAt: pullRequest.staleAt,
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
