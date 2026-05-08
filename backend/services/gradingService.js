/**
 * services/gradingService.js
 *
 * Business logic for committee grading and score submissions.
 * Implements async audit logging to D6 (Issue #260, Connector f14).
 */

const { Grade, Deliverable, AuditLog, User } = require('../models');

class GradingService {
  /**
   * Submit grades for a deliverable.
   *
   * Fire-and-forget async logging: Audit events are dispatched asynchronously
   * and do not block the API response. Logging failures are silently caught.
   *
   * @param {Object} params
   * @param {string} params.deliverableId - Deliverable UUID
   * @param {string} params.gradedBy - User ID (reviewer/committee member)
   * @param {Array} params.scores - Array of {criterionId, value, note}
   * @param {string} params.comments - Optional feedback
   * @param {string} params.gradeType - ADVISOR_SOFT, COMMITTEE_FINAL, PEER_REVIEW
   *
   * @returns {Promise<Object>} Created Grade
   * @throws {Error} Validation errors with code property
   */
  static async submitGrade({
    deliverableId,
    gradedBy,
    scores,
    comments,
    gradeType,
  }) {
    // Validate inputs
    if (!deliverableId || typeof deliverableId !== 'string') {
      const error = new Error('Invalid deliverable ID');
      error.code = 'INVALID_DELIVERABLE_ID';
      throw error;
    }

    if (!gradedBy) {
      const error = new Error('Grader user ID is required');
      error.code = 'INVALID_GRADER_ID';
      throw error;
    }

    if (!['ADVISOR_SOFT', 'COMMITTEE_FINAL', 'PEER_REVIEW'].includes(gradeType)) {
      const error = new Error(
        'Grade type must be ADVISOR_SOFT, COMMITTEE_FINAL, or PEER_REVIEW'
      );
      error.code = 'INVALID_GRADE_TYPE';
      throw error;
    }

    if (!Array.isArray(scores) || scores.length === 0) {
      const error = new Error('At least one score is required');
      error.code = 'INVALID_SCORES';
      throw error;
    }

    // Validate each score
    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];

      if (!score.criterionId) {
        const error = new Error(`Score ${i} missing criterionId`);
        error.code = 'INVALID_SCORE_FORMAT';
        throw error;
      }

      if (
        typeof score.value !== 'number' ||
        isNaN(score.value) ||
        score.value < 0 ||
        score.value > 1
      ) {
        const error = new Error(`Score ${i} value must be between 0 and 1`);
        error.code = 'INVALID_SCORE_VALUE';
        throw error;
      }
    }

    // Verify deliverable exists
    const deliverable = await Deliverable.findByPk(deliverableId);
    if (!deliverable) {
      const error = new Error('Deliverable not found');
      error.code = 'DELIVERABLE_NOT_FOUND';
      throw error;
    }

    // Check if grader already graded this deliverable
    const existing = await Grade.findOne({
      where: { deliverableId, gradedBy },
    });

    // Calculate final score (average of criterion values) up front so it persists.
    const finalScoreRaw = scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;
    const finalScore = parseFloat(finalScoreRaw.toFixed(2));

    let grade;
    if (existing) {
      // Update existing grade
      existing.scores = scores;
      existing.comments = comments || null;
      existing.gradeType = gradeType;
      existing.finalScore = finalScore;
      await existing.save();
      grade = existing;
    } else {
      // Create new grade
      grade = await Grade.create({
        deliverableId,
        gradedBy,
        scores,
        comments: comments || null,
        gradeType,
        finalScore,
      });
    }

    // Fire-and-forget: Log grading asynchronously without blocking response
    GradingService._logGrading({
      gradeId: grade.id,
      deliverableId,
      deliverableType: deliverable.type,
      reviewerId: gradedBy,
      gradeType,
      finalScore: grade.finalScore,
      criteriaCount: scores.length,
      groupId: deliverable.groupId,
    }).catch((error) => {
      console.error('[GradingService] Failed to log grading:', error);
      // Silently fail to prevent blocking the main response
    });

    return grade;
  }

  /**
   * Internal: Log grading to D6 (Audit Logs).
   *
   * Creates an AuditLog entry with action=GRADE_SUBMITTED and metadata
   * identifying this as a GRADING_EVENT with reviewer details.
   *
   * @param {Object} eventData
   * @param {string} eventData.gradeId - Grade UUID
   * @param {string} eventData.deliverableId - Deliverable UUID
   * @param {string} eventData.deliverableType - PROPOSAL or SOW
   * @param {string} eventData.reviewerId - User ID (committee member)
   * @param {string} eventData.gradeType - Grade type
   * @param {number} eventData.finalScore - Average score
   * @param {number} eventData.criteriaCount - Number of criteria scored
   * @param {string} eventData.groupId - Group ID
   *
   * @returns {Promise<AuditLog>}
   */
  static async _logGrading({
    gradeId,
    deliverableId,
    deliverableType,
    reviewerId,
    gradeType,
    finalScore,
    criteriaCount,
    groupId,
  }) {
    return AuditLog.create({
      action: 'GRADE_SUBMITTED',
      actorId: reviewerId,
      targetType: 'GRADE',
      targetId: gradeId,
      metadata: {
        deliverableType,
        submissionRef: `${deliverableType}-${groupId}`,
        reviewerId,
        gradeType,
        finalScore: parseFloat(finalScore.toFixed(2)),
        criteriaCount,
        eventType: 'GRADING_EVENT',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * List grades for a specific deliverable.
   *
   * @param {string} deliverableId - Deliverable UUID
   * @returns {Promise<Array>}
   */
  static async listDeliverableGrades(deliverableId) {
    return Grade.findAll({
      where: { deliverableId },
      include: [
        {
          model: User,
          as: 'grader',
          attributes: ['id', 'fullName'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }
}

module.exports = GradingService;
