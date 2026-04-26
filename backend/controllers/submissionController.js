/**
 * controllers/submissionController.js
 *
 * Handles endpoints for retrieving submission documents for committee review.
 * Maps to D5 Document Retrieval (Connector f9, Issue #249).
 */

const { validationResult, param, query } = require('express-validator');
const SubmissionService = require('../services/submissionService');
const { AuditLog } = require('../models');

/**
 * Validation middleware for GET /committee/submissions/:submissionId
 */
const getSubmissionValidation = [
  param('submissionId')
    .isUUID()
    .withMessage('Invalid submission ID format'),
  query('includeHistory')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('includeHistory must be true or false'),
];

/**
 * GET /api/v1/committee/submissions/:submissionId
 *
 * Retrieves a submission with complete document content, rubric, and grading history.
 * Returns SubmissionReviewPacket for committee review.
 *
 * Access:
 * - ADMIN, COORDINATOR: all submissions
 * - PROFESSOR: submissions (committee member)
 * - STUDENT: own group's submissions only
 *
 * @returns {Object} SubmissionReviewPacket
 *   {
 *     submission: { id, groupId, groupName, type, status, submittedAt },
 *     document: { content: string (markdown), images: URL[] },
 *     rubric: { id, name, criteria: [{id, question, type, weight}] },
 *     previousGrades: [{ scores, comments, gradedBy, submittedAt }]
 *   }
 */
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
    // Check authorization
    const hasAccess = await SubmissionService.canUserAccessSubmission(
      submissionId,
      user
    );

    if (!hasAccess) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'You do not have access to this submission',
      });
    }

    // Fetch submission review packet
    const packet = await SubmissionService.fetchSubmissionForReview(submissionId);

    // Audit log the access
    if (user?.id) {
      await AuditLog.create({
        action: 'SUBMISSION_VIEWED',
        actorId: user.id,
        targetType: 'SUBMISSION',
        targetId: submissionId,
        metadata: {
          submissionId,
          groupId: packet.submission.groupId,
          accessedAt: new Date().toISOString(),
        },
      }).catch((err) => {
        console.error('Failed to log submission access:', err);
        // Don't fail the request if audit log fails
      });
    }

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Submission retrieved successfully',
      data: packet,
    });
  } catch (error) {
    if (error.code === 'SUBMISSION_NOT_FOUND') {
      return res.status(error.statusCode || 404).json({
        code: error.code,
        message: error.message,
      });
    }

    console.error('Error fetching submission:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve submission',
    });
  }
}

/**
 * GET /api/v1/committee/submissions
 *
 * List all submissions accessible to the current user.
 * For committee members: all submissions
 * For coordinators: all submissions
 * For students: only group's submissions
 *
 * @returns {Array} List of submission summaries
 */
async function listSubmissions(req, res) {
  const user = req.user;

  try {
    let submissions;

    if (['ADMIN', 'COORDINATOR'].includes(user?.role)) {
      // Fetch all submissions
      submissions = await SubmissionService.listAllSubmissions();
    } else if (user?.role === 'PROFESSOR') {
      // Fetch all submissions (professor is committee member)
      submissions = await SubmissionService.listAllSubmissions();
    } else if (user?.role === 'STUDENT' && user?.groupId) {
      // Fetch only group's submissions
      submissions = await SubmissionService.listGroupSubmissions(user.groupId);
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
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve submissions',
    });
  }
}

module.exports = {
  getSubmission,
  listSubmissions,
  getSubmissionValidation,
};
