const { body, param, validationResult } = require('express-validator');
const { Group, IntegrationBinding } = require('../models');

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

async function createIntegrationBinding(req, res) {
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

    if (String(group.leaderId || '') !== String(req.user?.id)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Only the team leader can bind integrations for this team',
      });
    }

    const existingBinding = await IntegrationBinding.findOne({
      where: { teamId: normalizedTeamId },
    });

    if (existingBinding) {
      return res.status(409).json({
        code: 'INTEGRATION_BINDING_EXISTS',
        message: 'An integration binding already exists for this team',
      });
    }

    const binding = await IntegrationBinding.create({
      teamId: normalizedTeamId,
      providerSet: req.body.providerSet.map((provider) => String(provider).toUpperCase()),
      organizationName: String(req.body.organizationName).trim(),
      repositoryName: String(req.body.repositoryName).trim(),
      jiraWorkspaceId: req.body.jiraWorkspaceId ? String(req.body.jiraWorkspaceId).trim() : null,
      jiraProjectKey: String(req.body.jiraProjectKey).trim(),
      defaultBranch: req.body.defaultBranch ? String(req.body.defaultBranch).trim() : null,
      initiatedBy,
      status: 'ACTIVE',
    });

    return res.status(201).json({
      bindingId: binding.bindingId,
      teamId: binding.teamId,
      providerSet: binding.providerSet,
      status: binding.status,
      createdAt: binding.createdAt,
    });
  } catch (error) {
    console.error('Error in createIntegrationBinding:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

module.exports = {
  createIntegrationBindingValidation,
  createIntegrationBinding,
};
