/**
 * controllers/submissionController.js
 *
 * HTTP handlers for deliverable submission endpoints (D6 logging, Issue #257)
 * and committee review document retrieval (D5, Issue #249).
 */

const { validationResult, body, param, query } = require('express-validator');
const SubmissionService = require('../services/submissionService');
const { AuditLog } = require('../models');
const { validate: isUUID } = require('uuid');

const submitDeliverableValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
  body('type')
    .isIn(['PROPOSAL', 'SOW'])
    .withMessage('Deliverable type must be PROPOSAL or SOW'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Deliverable content is required')
    .isLength({ min: 10 })
    .withMessage('Deliverable content must be at least 10 characters'),
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array of URLs'),
];

const listDeliverableValidation = [
  param('groupId')
    .custom((value) => isUUID(value))
    .withMessage('Group ID must be a valid UUID'),
];

const getSubmissionValidation = [
  param('submissionId')
    .isUUID()
    .withMessage('Invalid submission ID format'),
  query('includeHistory')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('includeHistory must be true or false'),
];

async function submitDeliverable(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid submission data',
      errors: errors.array(),
    });
  }

  const { groupId } = req.params;
  const { type, content, images } = req.body;
  const submittedBy = req.user?.id;

  try {
    const deliverable = await SubmissionService.submitDeliverable({
      groupId,
      type,
      content,
      images,
      submitBy: submittedBy,
    });

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Deliverable submitted successfully',
      data: {
        id: deliverable.id,
        groupId: deliverable.groupId,
        type: deliverable.type,
        status: deliverable.status,
        version: deliverable.version,
        createdAt: deliverable.createdAt,
        updatedAt: deliverable.updatedAt,
      },
    });
  } catch (error) {
    if (error.code && ['INVALID_GROUP_ID', 'INVALID_DELIVERABLE_TYPE', 'INVALID_CONTENT', 'INVALID_SUBMITTER', 'GROUP_NOT_FOUND'].includes(error.code)) {
      const statusCode = error.code === 'GROUP_NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).json({ code: error.code, message: error.message });
    }

    console.error('Error submitting deliverable:', error);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to submit deliverable' });
  }
}

async function listDeliverables(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid group ID',
      errors: errors.array(),
    });
  }

  const { groupId } = req.params;

  try {
    const deliverables = await SubmissionService.listGroupSubmissions(groupId);

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Deliverables retrieved successfully',
      data: deliverables.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        version: d.version,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Error listing deliverables:', error);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to retrieve deliverables' });
  }
}

async function getSubmission(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request parameters',
      errors: errors.array(),
    });
  }

  const { submissionId } = req.params;
  const user = req.user;

  try {
    // Existence check runs first so a missing submission returns 404, not 403.
    const submission = await SubmissionService.getSubmissionById(submissionId);
    if (!submission) {
      return res.status(404).json({ code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' });
    }

    const hasAccess = await SubmissionService.canUserAccessSubmission(submissionId, user);
    if (!hasAccess) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'You do not have access to this submission' });
    }

    const packet = await SubmissionService.fetchSubmissionForReview(submissionId);

    if (user?.id) {
      AuditLog.create({
        action: 'SUBMISSION_VIEWED',
        actorId: user.id,
        targetType: 'SUBMISSION',
        targetId: submissionId,
        metadata: {
          submissionId,
          groupId: packet.submission.groupId,
          accessedAt: new Date().toISOString(),
        },
      }).catch((err) => console.error('Failed to log submission access:', err));
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Submission retrieved successfully',
      data: packet,
    });
  } catch (error) {
    if (error.code === 'SUBMISSION_NOT_FOUND') {
      return res.status(error.statusCode || 404).json({ code: error.code, message: error.message });
    }

    console.error('Error fetching submission:', error);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to retrieve submission' });
  }
}

async function listSubmissions(req, res) {
  const user = req.user;

  try {
    let submissions;

    if (['ADMIN', 'COORDINATOR', 'PROFESSOR'].includes(user?.role)) {
      submissions = await SubmissionService.listAllSubmissions();
    } else if (user?.role === 'STUDENT' && user?.groupId) {
      const raw = await SubmissionService.listGroupSubmissions(user.groupId);
      submissions = raw.map((d) => ({
        id: d.id,
        groupId: d.groupId,
        type: d.type,
        status: d.status,
        version: d.version,
        submittedAt: d.createdAt,
      }));
    } else {
      submissions = [];
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Submissions retrieved successfully',
      data: submissions,
    });
  } catch (error) {
    console.error('Error listing submissions:', error);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to retrieve submissions' });
  }
}

module.exports = {
  submitDeliverable,
  listDeliverables,
  submitDeliverableValidation,
  listDeliverableValidation,
  getSubmission,
  listSubmissions,
  getSubmissionValidation,
};
