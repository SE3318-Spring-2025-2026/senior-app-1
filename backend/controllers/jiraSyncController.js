const { randomUUID } = require('crypto');
const { body, param, validationResult } = require('express-validator');
const {
  Group,
  IntegrationBinding,
  IntegrationTokenReference,
} = require('../models');
const { ApiError } = require('../middleware/errorResponse');
const { hasProvider } = require('../services/sprintMonitoringPersistenceService');
const { syncJiraSprintIssues } = require('../services/jiraSprintSyncService');

function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

const triggerJiraSyncValidation = [
  param('teamId')
    .trim()
    .notEmpty()
    .withMessage('teamId is required'),
  param('sprintId')
    .trim()
    .notEmpty()
    .withMessage('sprintId is required'),
  body('requestedBy')
    .isString()
    .withMessage('requestedBy must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('requestedBy is required'),
  body('boardId')
    .isString()
    .withMessage('boardId must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('boardId is required'),
  body('includeStatuses')
    .optional({ values: 'undefined' })
    .isArray()
    .withMessage('includeStatuses must be an array'),
  body('includeStatuses.*')
    .optional()
    .isString()
    .withMessage('includeStatuses entries must be strings')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('includeStatuses entries must not be empty'),
];

async function triggerJiraSync(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  try {
    const teamId = asTrimmedString(req.params.teamId);
    const sprintId = asTrimmedString(req.params.sprintId);
    const requestedBy = asTrimmedString(req.body.requestedBy);
    const boardId = asTrimmedString(req.body.boardId);
    const includeStatuses = Array.isArray(req.body.includeStatuses)
      ? req.body.includeStatuses.map((status) => asTrimmedString(status)).filter(Boolean)
      : [];

    const group = await Group.findByPk(teamId);
    if (!group) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    if (String(req.user?.id) !== requestedBy) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'requestedBy must match the authenticated user',
      });
    }

    if (String(group.leaderId || '') !== String(req.user?.id)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Only the team leader can trigger Jira sync for this team',
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

    if (!hasProvider(binding, 'JIRA')) {
      return res.status(409).json({
        code: 'JIRA_PROVIDER_NOT_ENABLED',
        message: 'This team is not bound to Jira integration',
      });
    }

    const tokenReference = await IntegrationTokenReference.findByPk(teamId);
    if (!asTrimmedString(tokenReference?.jiraTokenRef)) {
      return res.status(409).json({
        code: 'JIRA_TOKEN_REFERENCE_NOT_FOUND',
        message: 'No Jira token reference exists for this team',
      });
    }

    const syncResult = await syncJiraSprintIssues({
      binding,
      tokenReference,
      teamId,
      sprintId,
      boardId,
      includeStatuses,
    });

    return res.status(200).json({
      id: `op_${randomUUID()}`,
      status: 'SYNCED',
      message: 'Jira sprint sync completed successfully.',
      recordedAt: new Date().toISOString(),
      teamId,
      sprintId,
      upstreamIssueCount: syncResult.upstreamIssueCount,
      storedStoryCount: syncResult.storedStoryCount,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    console.error('Error in triggerJiraSync:', error);
    return res.status(500).json({
      code: 'JIRA_SYNC_REQUEST_BUILD_FAILED',
      message: 'Failed to synchronize Jira sprint issues',
    });
  }
}

module.exports = {
  triggerJiraSyncValidation,
  triggerJiraSync,
};
