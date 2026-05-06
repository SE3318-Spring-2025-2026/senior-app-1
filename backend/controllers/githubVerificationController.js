const { param, body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const {
  Group,
  AuditLog,
  IntegrationBinding,
  IntegrationTokenReference,
} = require('../models');
const { ApiError } = require('../middleware/errorResponse');
const { canManageIntegrations } = require('./integrationBindingController');
const { hasProvider } = require('../services/sprintMonitoringPersistenceService');
const { syncGitHubPullRequests } = require('../services/githubSprintSyncService');

exports.triggerGitHubVerificationValidation = [
  param('teamId').isString().trim().notEmpty().withMessage('Team ID is required'),
  param('sprintId').isString().trim().notEmpty().withMessage('Sprint ID is required'),
  body('requestedBy').isString().trim().notEmpty().withMessage('requestedBy is required'),
  body('branchNames').optional().isArray(),
  body('relatedIssueKeys').optional().isArray(),
  body().custom((value = {}) => {
    const branchNames = Array.isArray(value.branchNames) ? value.branchNames : [];
    const relatedIssueKeys = Array.isArray(value.relatedIssueKeys) ? value.relatedIssueKeys : [];
    if (branchNames.length > 0 || relatedIssueKeys.length > 0) {
      return true;
    }

    throw new Error('At least one branch name or related issue key is required');
  }),
];

exports.triggerGitHubVerification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const teamId = String(req.params.teamId).trim();
    const sprintId = String(req.params.sprintId).trim();
    const { branchNames = [], relatedIssueKeys = [], requestedBy } = req.body;

    const group = await Group.findByPk(teamId);
    if (!group) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Team not found',
      });
    }

    if (String(req.user?.id) !== String(requestedBy).trim()) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'requestedBy must match the authenticated user',
      });
    }

    if (!canManageIntegrations(group, req.user)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Only the team leader or authorized staff can trigger GitHub sync for this team',
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

    if (!hasProvider(binding, 'GITHUB')) {
      return res.status(409).json({
        code: 'GITHUB_PROVIDER_NOT_ENABLED',
        message: 'This team is not bound to GitHub integration',
      });
    }

    const tokenReference = await IntegrationTokenReference.findByPk(teamId);
    if (!String(tokenReference?.githubTokenRef || '').trim()) {
      return res.status(409).json({
        code: 'GITHUB_TOKEN_REFERENCE_NOT_FOUND',
        message: 'No GitHub token reference exists for this team',
      });
    }

    const operationId = uuidv4();

    try {
      await AuditLog.create({
        action: 'GITHUB_VERIFICATION_TRIGGERED',
        actorId: req.user ? req.user.id : null,
        targetType: 'GROUP',
        targetId: teamId,
        metadata: {
          sprintId,
          branchNames,
          relatedIssueKeys,
          requestedBy,
          operationId,
        },
      });
    } catch (logErr) {
      console.error('Failed to write audit log for GitHub verification trigger', logErr);
    }

    const syncResult = await syncGitHubPullRequests({
      binding,
      tokenReference,
      teamId,
      sprintId,
      branchNames,
      issueKeys: relatedIssueKeys,
    });

    return res.status(200).json({
      code: 'SYNCED',
      message: 'GitHub sprint pull requests synchronized successfully',
      data: {
        operationId,
        status: 'synced',
        teamId,
        sprintId,
        upstreamPullRequestCount: syncResult.upstreamPullRequestCount,
        storedPullRequestCount: syncResult.storedPullRequestCount,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    console.error('Error in triggerGitHubVerification:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};
