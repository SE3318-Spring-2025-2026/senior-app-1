const { param, body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const fetch = global.fetch || require('node-fetch');
const { Group, AuditLog } = require('../models');
const githubLinkService = require('../services/githubLinkService');

exports.triggerGitHubVerificationValidation = [
  param('teamId').isString().trim().notEmpty().withMessage('Team ID is required'),
  param('sprintId').isString().trim().notEmpty().withMessage('Sprint ID is required'),
  body('requestedBy').isString().trim().notEmpty().withMessage('requestedBy is required'),
  body('branchNames').optional().isArray(),
  body('relatedIssueKeys').optional().isArray(),
];

/**
 * POST /api/v1/teams/:teamId/sprints/:sprintId/github-verifications
 * Triggers an asynchronous GitHub PR verification workflow for a team/sprint.
 * Auth: Required
 */
exports.triggerGitHubVerification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });
    }

    const { teamId, sprintId } = req.params;
    const { branchNames = [], relatedIssueKeys = [], requestedBy } = req.body;

    // Validate team existence (maps to Group)
    const group = await Group.findByPk(String(teamId).trim());
    if (!group) {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Team not found' });
    }

    // Validate integration configuration is present (no hardcoded tokens)
    if (!githubLinkService.hasRealGitHubOAuthConfig()) {
      return res.status(400).json({ code: 'GITHUB_INTEGRATION_MISSING', message: 'GitHub integration not configured' });
    }

    const operationId = uuidv4();

    // Log initiation for traceability
    try {
      await AuditLog.create({
        action: 'GITHUB_VERIFICATION_TRIGGERED',
        actorId: req.user ? req.user.id : null,
        targetType: 'GROUP',
        targetId: String(teamId),
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

    // Asynchronously notify internal ingestion/orchestration endpoint
    // Fire-and-forget: do not wait for ingestion to complete.
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const url = `${baseUrl}/api/v1/internal/github/pr-data`;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId,
          teamId,
          sprintId,
          branchNames,
          relatedIssueKeys,
          requestedBy,
          initiatedBy: req.user ? req.user.id : null,
        }),
      }).catch((err) => console.error('Failed to trigger internal GitHub ingestion', err));
    } catch (err) {
      console.error('Error initiating internal GitHub ingestion request', err);
    }

    return res.status(202).json({
      code: 'ACCEPTED',
      message: 'GitHub verification triggered',
      data: {
        operationId,
        status: 'queued',
      },
    });
  } catch (error) {
    console.error('Error in triggerGitHubVerification:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};
