const { body, validationResult } = require('express-validator');
const { IntegrationTokenReference } = require('../models');

const storeIntegrationTokenValidation = [
  body('teamId')
    .trim()
    .notEmpty()
    .withMessage('teamId is required'),
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
    const hasGithubTokenRef = typeof value.githubTokenRef === 'string' && value.githubTokenRef.trim() !== '';
    const hasJiraTokenRef = typeof value.jiraTokenRef === 'string' && value.jiraTokenRef.trim() !== '';

    if (!hasGithubTokenRef && !hasJiraTokenRef) {
      throw new Error('At least one token reference is required');
    }

    return true;
  }),
];

async function storeIntegrationTokenReferences(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  try {
    const { teamId, githubTokenRef, jiraTokenRef } = req.body;
    const existingRecord = await IntegrationTokenReference.findByPk(teamId);

    const payload = {
      teamId: teamId.trim(),
      githubTokenRef: typeof githubTokenRef === 'string'
        ? githubTokenRef.trim()
        : existingRecord?.githubTokenRef ?? null,
      jiraTokenRef: typeof jiraTokenRef === 'string'
        ? jiraTokenRef.trim()
        : existingRecord?.jiraTokenRef ?? null,
    };

    await IntegrationTokenReference.upsert(payload);

    return res.status(200).json({
      code: 'SUCCESS',
      success: true,
      message: 'Integration token references stored successfully',
      teamId: payload.teamId,
    });
  } catch (error) {
    console.error('Error in storeIntegrationTokenReferences:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

module.exports = {
  storeIntegrationTokenValidation,
  storeIntegrationTokenReferences,
};
