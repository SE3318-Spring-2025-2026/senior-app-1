'use strict';

const { body, param, validationResult } = require('express-validator');
const deliverableSubmissionService = require('../services/deliverableSubmissionService');

const submitDeliverableValidation = [
  param('groupId').notEmpty().withMessage('groupId is required'),
  body('sprintNumber')
    .exists().withMessage('sprintNumber is required')
    .bail()
    .isInt({ min: 1 }).withMessage('sprintNumber must be a positive integer'),
  body('deliverableType')
    .exists().withMessage('deliverableType is required')
    .bail()
    .isIn(['PROPOSAL', 'SOW']).withMessage('deliverableType must be PROPOSAL or SOW'),
  body('documentRef')
    .exists().withMessage('documentRef is required')
    .bail()
    .isString().notEmpty().withMessage('documentRef must be a non-empty string'),
  body('metadata')
    .optional()
    .isObject().withMessage('metadata must be an object if provided'),
];

async function submitDeliverable(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid submission payload',
      errors: errors.array(),
    });
  }

  const { groupId } = req.params;
  const { sprintNumber, deliverableType, documentRef, metadata } = req.body;

  try {
    const submission = await deliverableSubmissionService.submitDeliverable(
      groupId,
      { sprintNumber, deliverableType, documentRef, metadata },
      req.user.id,
    );

    return res.status(201).json({
      code: 'CREATED',
      message: 'Deliverable submission recorded successfully',
      submission: {
        id: submission.id,
        groupId: submission.groupId,
        sprintNumber: submission.sprintNumber,
        deliverableType: submission.deliverableType,
        documentRef: submission.documentRef,
        submittedBy: submission.submittedBy,
        metadata: submission.metadata,
        createdAt: submission.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: error.message });
    }
    if (error.code === 'NOT_A_MEMBER') {
      return res.status(403).json({ code: 'NOT_A_MEMBER', message: error.message });
    }
    console.error('Error recording deliverable submission:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to record deliverable submission' });
  }
}

async function listSubmissions(req, res) {
  const { groupId } = req.params;
  try {
    const submissions = await deliverableSubmissionService.listSubmissions(groupId);
    return res.status(200).json({ code: 'SUCCESS', submissions });
  } catch (error) {
    console.error('Error listing submissions:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to list submissions' });
  }
}

module.exports = {
  submitDeliverableValidation,
  submitDeliverable,
  listSubmissions,
};
