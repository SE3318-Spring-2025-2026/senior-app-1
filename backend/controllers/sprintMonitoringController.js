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
const { fetchJiraSprintIssues } = require('../services/jiraSprintSyncService');
const { normalizeJiraIssue } = require('../services/jiraIssueNormalizer');

const getSprintMonitoringSnapshotValidation = [
  param('teamId').isString().trim().notEmpty().withMessage('teamId is required'),
  param('sprintId').isString().trim().notEmpty().withMessage('sprintId is required'),
  query('includeStale')
    .optional()
    .isBoolean()
    .withMessage('includeStale must be a boolean'),
];

const getCurrentSprintMonitoringSnapshotValidation = [
  param('teamId').isString().trim().notEmpty().withMessage('teamId is required'),
  query('includeStale')
    .optional()
    .isBoolean()
    .withMessage('includeStale must be a boolean'),
];

function parseIncludeStaleQuery(req) {
  return String(req.query.includeStale || '').toLowerCase() === 'true';
}

async function loadAuthorizedMonitoringContext(teamId, user) {
  const group = await Group.findByPk(teamId);
  if (!group) {
    return {
      error: {
        status: 404,
        body: {
          code: 'GROUP_NOT_FOUND',
          message: 'Group not found',
        },
      },
    };
  }

  if (!canManageIntegrations(group, user)) {
    return {
      error: {
        status: 403,
        body: {
          code: 'FORBIDDEN',
          message: 'Only the team leader or authorized staff can view sprint monitoring data',
        },
      },
    };
  }

  const binding = await IntegrationBinding.findOne({
    where: { teamId },
  });
  if (!binding) {
    return {
      error: {
        status: 404,
        body: {
          code: 'INTEGRATION_BINDING_NOT_FOUND',
          message: 'No integration binding exists for this team',
        },
      },
    };
  }

  const tokenReference = await IntegrationTokenReference.findByPk(teamId);
  return { group, binding, tokenReference };
}

function pickCurrentSprintIdFromIssues(rawIssues) {
  const sprintSummaries = new Map();

  for (const issue of rawIssues) {
    const normalized = normalizeJiraIssue(issue);
    if (!normalized.sprintId) {
      continue;
    }

    const existing = sprintSummaries.get(normalized.sprintId) || {
      sprintId: normalized.sprintId,
      issueCount: 0,
      latestUpdatedAt: '',
    };

    existing.issueCount += 1;
    if (normalized.sourceUpdatedAt && (!existing.latestUpdatedAt
      || new Date(normalized.sourceUpdatedAt).getTime() > new Date(existing.latestUpdatedAt).getTime())) {
      existing.latestUpdatedAt = normalized.sourceUpdatedAt;
    }

    sprintSummaries.set(normalized.sprintId, existing);
  }

  const ordered = [...sprintSummaries.values()].sort((left, right) => {
    if (right.issueCount !== left.issueCount) {
      return right.issueCount - left.issueCount;
    }

    const leftUpdatedAt = left.latestUpdatedAt ? new Date(left.latestUpdatedAt).getTime() : 0;
    const rightUpdatedAt = right.latestUpdatedAt ? new Date(right.latestUpdatedAt).getTime() : 0;
    if (rightUpdatedAt !== leftUpdatedAt) {
      return rightUpdatedAt - leftUpdatedAt;
    }

    return String(left.sprintId).localeCompare(String(right.sprintId));
  });

  return ordered[0] || null;
}

async function buildSprintMonitoringSnapshotResponse({ teamId, sprintId, includeStale, binding, tokenReference }) {
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

  return {
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
  };
}

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
    const includeStale = parseIncludeStaleQuery(req);

    const context = await loadAuthorizedMonitoringContext(teamId, req.user);
    if (context.error) {
      return res.status(context.error.status).json(context.error.body);
    }

    const snapshot = await buildSprintMonitoringSnapshotResponse({
      teamId,
      sprintId,
      includeStale,
      binding: context.binding,
      tokenReference: context.tokenReference,
    });

    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('Error in getSprintMonitoringSnapshot:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to load sprint monitoring snapshot',
    });
  }
}

async function getCurrentSprintMonitoringSnapshot(req, res) {
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
    const includeStale = parseIncludeStaleQuery(req);

    const context = await loadAuthorizedMonitoringContext(teamId, req.user);
    if (context.error) {
      return res.status(context.error.status).json(context.error.body);
    }

    const rawIssues = await fetchJiraSprintIssues({
      binding: context.binding,
      tokenReference: context.tokenReference,
      projectKey: context.binding.jiraProjectKey,
    });
    const currentSprint = pickCurrentSprintIdFromIssues(rawIssues);

    if (!currentSprint) {
      return res.status(404).json({
        code: 'ACTIVE_SPRINT_NOT_FOUND',
        message: 'No active Jira sprint could be resolved for this team',
      });
    }

    const snapshot = await buildSprintMonitoringSnapshotResponse({
      teamId,
      sprintId: currentSprint.sprintId,
      includeStale,
      binding: context.binding,
      tokenReference: context.tokenReference,
    });

    return res.status(200).json({
      ...snapshot,
      resolvedSprint: {
        sprintId: currentSprint.sprintId,
        issueCount: currentSprint.issueCount,
        latestUpdatedAt: currentSprint.latestUpdatedAt || null,
      },
    });
  } catch (error) {
    console.error('Error in getCurrentSprintMonitoringSnapshot:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to load current sprint monitoring snapshot',
    });
  }
}

module.exports = {
  getSprintMonitoringSnapshotValidation,
  getSprintMonitoringSnapshot,
  getCurrentSprintMonitoringSnapshotValidation,
  getCurrentSprintMonitoringSnapshot,
  pickCurrentSprintIdFromIssues,
};
