/**
 * routes/final-evaluation.js
 *
 * Routes for final evaluation endpoints.
 * POST /api/v1/final-evaluation/groups/:groupId/committee-grade
 * PUT /api/v1/final-evaluation/groups/:groupId/committee-grade
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  submitCommitteeGrade,
  submitCommitteeGradeValidation,
  updateCommitteeGrade,
  updateCommitteeGradeValidation,
} = require('../controllers/finalEvaluationController');

const router = express.Router();

/**
 * POST /api/v1/final-evaluation/groups/:groupId/committee-grade
 *
 * Submit committee grade for a group deliverable.
 *
 * @requires Authorization header with valid JWT token
 * @requires User role must be PROFESSOR
 * @param {string} groupId - Group UUID (URL parameter)
 * @param {string} deliverableId - Deliverable UUID (body)
 * @param {Array} scores - Array of {criterionId, value, note} (body)
 * @param {string} [comments] - Optional feedback (body)
 *
 * @returns {201} Grade submitted successfully
 * @returns {400} Invalid input
 * @returns {401} No auth header
 * @returns {403} User is not PROFESSOR or group is finalized
 * @returns {404} Group or deliverable not found
 * @returns {409} Same reviewer already submitted for this deliverable
 */
router.post(
  '/api/v1/final-evaluation/groups/:groupId/committee-grade',
  authenticate,
  authorize(['PROFESSOR']),
  submitCommitteeGradeValidation,
  submitCommitteeGrade
);

/**
 * PUT /api/v1/final-evaluation/groups/:groupId/committee-grade
 *
 * Update committee grade for a group deliverable.
 *
 * @requires Authorization header with valid JWT token
 * @requires User role must be PROFESSOR
 * @param {string} groupId - Group UUID (URL parameter)
 * @param {string} deliverableId - Deliverable UUID (body)
 * @param {Array} scores - Array of {criterionId, value, note} (body)
 * @param {string} [comments] - Optional feedback (body)
 *
 * @returns {200} Grade updated successfully
 * @returns {400} Invalid input
 * @returns {401} No auth header
 * @returns {403} User is not PROFESSOR or group is finalized
 * @returns {404} Group, deliverable, or grade not found
 */
router.put(
  '/api/v1/final-evaluation/groups/:groupId/committee-grade',
  authenticate,
  authorize(['PROFESSOR']),
  updateCommitteeGradeValidation,
  updateCommitteeGrade
);

module.exports = router;
