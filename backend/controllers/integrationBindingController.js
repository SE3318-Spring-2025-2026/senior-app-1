const { body, param, validationResult } = require('express-validator');
const { Group, IntegrationBinding, IntegrationTokenReference } = require('../models');

const ALLOWED_PROVIDERS = ['GITHUB', 'JIRA'];

const createIntegrationBindingValidation = [
  param('teamId')
    .trim()
    .notEmpty()
    .withMessage('teamId is required'),
  body('providerSet')
    .isArray({ min: 1 })
    .withMessage('providerSet must be a non-empty array'),
  body('providerSet.*')
    .isString()
    .withMessage('providerSet entries must be strings')
    .bail()
    .custom((value) => ALLOWED_PROVIDERS.includes(String(value).toUpperCase()))
    .withMessage('providerSet contains an unsupported provider'),
  body('organizationName')
    .trim()
    .notEmpty()
    .withMessage('organizationName is required'),
  body('repositoryName')
    .trim()
    .notEmpty()
    .withMessage('repositoryName is required'),
  body('jiraProjectKey')
    .trim()
    .notEmpty()
    .withMessage('jiraProjectKey is required'),
  body('initiatedBy')
    .trim()
    .notEmpty()
    .withMessage('initiatedBy is required'),
  body('jiraWorkspaceId')
    .optional({ values: 'undefined' })
    .isString()
    .withMessage('jiraWorkspaceId must be a string'),
  body('defaultBranch')
    .optional({ values: 'undefined' })
    .isString()
    .withMessage('defaultBranch must be a string'),
  body('githubTokenRef')
    .optional({ values: 'undefined' })
    .isString()
    .withMessage('githubTokenRef must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('githubTokenRef cannot be empty'),
  body('jiraTokenRef')
    .optional({ values: 'undefined' })
    .isString()
    .withMessage('jiraTokenRef must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('jiraTokenRef cannot be empty'),
  body().custom((value) => {
    const providers = Array.isArray(value.providerSet)
      ? value.providerSet.map((provider) => String(provider).toUpperCase())
      : [];

    if (new Set(providers).size !== providers.length) {
      throw new Error('providerSet cannot contain duplicate values');
    }

    return true;
  }),
];

function canManageIntegrations(group, user) {
  if (!user) {
    return false;
  }

  if (String(group.leaderId || '') === String(user.id)) {
    return true;
  }

  return ['ADMIN', 'COORDINATOR'].includes(String(user.role || '').toUpperCase());
}

function computeIntegrationStatus(binding, tokenReference) {
  const bindingStatus = String(binding?.status || 'ACTIVE').toUpperCase();
  const providers = Array.isArray(binding?.providerSet)
    ? binding.providerSet.map((provider) => String(provider).toUpperCase())
    : [];
  const hasGithubProvider = providers.includes('GITHUB');
  const hasJiraProvider = providers.includes('JIRA');
  const hasGithubTokenRef = Boolean(tokenReference?.githubTokenRef);
  const hasJiraTokenRef = Boolean(tokenReference?.jiraTokenRef);

  if ((hasGithubProvider && !hasGithubTokenRef) || (hasJiraProvider && !hasJiraTokenRef)) {
    return 'PARTIAL';
  }

  return bindingStatus;
}

function buildIntegrationResponse(binding, tokenReference) {
  return {
    bindingId: binding.bindingId,
    teamId: binding.teamId,
    providerSet: binding.providerSet,
    organizationName: binding.organizationName,
    repositoryName: binding.repositoryName,
    jiraProjectKey: binding.jiraProjectKey,
    jiraWorkspaceId: binding.jiraWorkspaceId,
    defaultBranch: binding.defaultBranch,
    status: computeIntegrationStatus(binding, tokenReference),
    hasGithubTokenRef: Boolean(tokenReference?.githubTokenRef),
    hasJiraTokenRef: Boolean(tokenReference?.jiraTokenRef),
    createdAt: binding.createdAt,
    lastUpdatedAt: tokenReference?.updatedAt ?? binding.updatedAt,
  };
}

async function saveIntegrationBinding(req, res, { allowUpdate }) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  try {
    const { teamId } = req.params;
    const normalizedTeamId = teamId.trim();
    const initiatedBy = String(req.body.initiatedBy).trim();
    const group = await Group.findByPk(normalizedTeamId);

    if (!group) {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    if (String(req.user?.id) !== initiatedBy) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'initiatedBy must match the authenticated user',
      });
    }

    if (!canManageIntegrations(group, req.user)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Only the team leader or authorized staff can manage integrations for this team',
      });
    }

    let binding = await IntegrationBinding.findOne({
      where: { teamId: normalizedTeamId },
    });
    const wasExisting = Boolean(binding);
    if (wasExisting && !allowUpdate) {
      return res.status(409).json({
        code: 'INTEGRATION_BINDING_EXISTS',
        message: 'An integration binding already exists for this team',
      });
    }
    if (!wasExisting && allowUpdate) {
      return res.status(404).json({
        code: 'INTEGRATION_BINDING_NOT_FOUND',
        message: 'No integration binding exists for this team',
      });
    }

    const providerSet = req.body.providerSet.map((provider) => String(provider).toUpperCase());
    const bindingPayload = {
      teamId: normalizedTeamId,
      providerSet,
      organizationName: String(req.body.organizationName).trim(),
      repositoryName: String(req.body.repositoryName).trim(),
      jiraWorkspaceId: req.body.jiraWorkspaceId ? String(req.body.jiraWorkspaceId).trim() : null,
      jiraProjectKey: String(req.body.jiraProjectKey).trim(),
      defaultBranch: req.body.defaultBranch ? String(req.body.defaultBranch).trim() : null,
      initiatedBy,
      status: 'ACTIVE',
    };

    if (binding) {
      await binding.update(bindingPayload);
    } else {
      binding = await IntegrationBinding.create(bindingPayload);
    }

    const existingTokenReference = await IntegrationTokenReference.findByPk(normalizedTeamId);
    const nextGithubTokenRef = typeof req.body.githubTokenRef === 'string'
      ? req.body.githubTokenRef.trim()
      : existingTokenReference?.githubTokenRef ?? null;
    const nextJiraTokenRef = typeof req.body.jiraTokenRef === 'string'
      ? req.body.jiraTokenRef.trim()
      : existingTokenReference?.jiraTokenRef ?? null;

    let tokenReference = existingTokenReference;
    if (nextGithubTokenRef || nextJiraTokenRef) {
      await IntegrationTokenReference.upsert({
        teamId: normalizedTeamId,
        githubTokenRef: nextGithubTokenRef,
        jiraTokenRef: nextJiraTokenRef,
      });
      tokenReference = await IntegrationTokenReference.findByPk(normalizedTeamId);
    }

    return res.status(wasExisting ? 200 : 201).json(
      buildIntegrationResponse(binding, tokenReference),
    );
  } catch (error) {
    console.error('Error in saveIntegrationBinding:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

async function createIntegrationBinding(req, res) {
  return saveIntegrationBinding(req, res, { allowUpdate: false });
}

async function updateIntegrationBinding(req, res) {
  return saveIntegrationBinding(req, res, { allowUpdate: true });
}

module.exports = {
  buildIntegrationResponse,
  canManageIntegrations,
  createIntegrationBindingValidation,
  createIntegrationBinding,
  updateIntegrationBinding,
};
