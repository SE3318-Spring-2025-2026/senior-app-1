/**
 * services/finalEvaluationService.js
 *
 * Business logic for committee final evaluation grading.
 * Implements submit/update committee grades for group deliverables.
 * Includes finalization lock check and duplicate reviewer guard.
 * Implements async audit logging to D6 (Issue #260, Connector f14).
 */

const { FinalEvaluationGrade, AdvisorGrade, Group, Deliverable, AuditLog, User } = require('../models');

class FinalEvaluationService {
  /**
   * Submit committee grade for a group deliverable.
   *
   * Fire-and-forget async logging: Audit events are dispatched asynchronously
   * and do not block the API response. Logging failures are silently caught.
   *
   * @param {Object} params
   * @param {string} params.groupId - Group UUID
   * @param {string} params.deliverableId - Deliverable UUID
   * @param {string} params.submittedBy - User ID (committee member/PROFESSOR)
   * @param {Array} params.scores - Array of {criterionId, value, note}
   * @param {string} params.comments - Optional feedback
   *
   * @returns {Promise<Object>} Created FinalEvaluationGrade
   * @throws {Error} Validation errors with code property
   */
  static async submitCommitteeGrade({
    groupId,
    deliverableId,
    submittedBy,
    scores,
    comments,
  }) {
    // Validate inputs
    if (!groupId || typeof groupId !== 'string') {
      const error = new Error('Invalid group ID');
      error.code = 'INVALID_GROUP_ID';
      throw error;
    }

    if (!deliverableId || typeof deliverableId !== 'string') {
      const error = new Error('Invalid deliverable ID');
      error.code = 'INVALID_DELIVERABLE_ID';
      throw error;
    }

    if (!submittedBy) {
      const error = new Error('Reviewer user ID is required');
      error.code = 'INVALID_REVIEWER_ID';
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

    // Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    // Finalization lock check: if group is FINALIZED, return 403
    if (group.status === 'FINALIZED') {
      const error = new Error('Cannot submit grade after finalization');
      error.code = 'FINALIZATION_LOCK_ERROR';
      error.statusCode = 403;
      throw error;
    }

    // Verify deliverable exists and belongs to this group
    const deliverable = await Deliverable.findByPk(deliverableId);
    if (!deliverable) {
      const error = new Error('Deliverable not found');
      error.code = 'DELIVERABLE_NOT_FOUND';
      throw error;
    }

    if (deliverable.groupId !== groupId) {
      const error = new Error('Deliverable does not belong to this group');
      error.code = 'DELIVERABLE_GROUP_MISMATCH';
      throw error;
    }

    // Duplicate reviewer guard: check if this reviewer already submitted
    const existing = await FinalEvaluationGrade.findOne({
      where: { groupId, deliverableId, submittedBy },
    });

    if (existing) {
      const error = new Error('This reviewer has already submitted a grade for this deliverable');
      error.code = 'DUPLICATE_REVIEWER_ERROR';
      error.statusCode = 409;
      throw error;
    }

    // Create new grade
    const grade = await FinalEvaluationGrade.create({
      groupId,
      deliverableId,
      submittedBy,
      scores,
      comments: comments || null,
    });

    // Calculate final score (average of criterion values)
    const finalScore =
      scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;
    grade.finalScore = parseFloat(finalScore.toFixed(2));

    // Fire-and-forget: Log grading asynchronously without blocking response
    FinalEvaluationService._logCommitteeGrade({
      gradeId: grade.id,
      groupId,
      deliverableId,
      reviewerId: submittedBy,
      finalScore: grade.finalScore,
      criteriaCount: scores.length,
      action: 'COMMITTEE_GRADE_SUBMITTED',
    }).catch((error) => {
      console.error('[FinalEvaluationService] Failed to log committee grade:', error);
      // Silently fail to prevent blocking the main response
    });

    return grade;
  }

  /**
   * Update committee grade for a group deliverable.
   *
   * @param {Object} params
   * @param {string} params.groupId - Group UUID
   * @param {string} params.deliverableId - Deliverable UUID
   * @param {string} params.submittedBy - User ID (committee member/PROFESSOR)
   * @param {Array} params.scores - Array of {criterionId, value, note}
   * @param {string} params.comments - Optional feedback
   *
   * @returns {Promise<Object>} Updated FinalEvaluationGrade
   * @throws {Error} Validation errors with code property
   */
  static async updateCommitteeGrade({
    groupId,
    deliverableId,
    submittedBy,
    scores,
    comments,
  }) {
    // Validate inputs (same as submitCommitteeGrade)
    if (!groupId || typeof groupId !== 'string') {
      const error = new Error('Invalid group ID');
      error.code = 'INVALID_GROUP_ID';
      throw error;
    }

    if (!deliverableId || typeof deliverableId !== 'string') {
      const error = new Error('Invalid deliverable ID');
      error.code = 'INVALID_DELIVERABLE_ID';
      throw error;
    }

    if (!submittedBy) {
      const error = new Error('Reviewer user ID is required');
      error.code = 'INVALID_REVIEWER_ID';
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

    // Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    // Finalization lock check: if group is FINALIZED, return 403
    if (group.status === 'FINALIZED') {
      const error = new Error('Cannot update grade after finalization');
      error.code = 'FINALIZATION_LOCK_ERROR';
      error.statusCode = 403;
      throw error;
    }

    // Verify deliverable exists and belongs to this group
    const deliverable = await Deliverable.findByPk(deliverableId);
    if (!deliverable) {
      const error = new Error('Deliverable not found');
      error.code = 'DELIVERABLE_NOT_FOUND';
      throw error;
    }

    if (deliverable.groupId !== groupId) {
      const error = new Error('Deliverable does not belong to this group');
      error.code = 'DELIVERABLE_GROUP_MISMATCH';
      throw error;
    }

    // Find existing grade
    const existing = await FinalEvaluationGrade.findOne({
      where: { groupId, deliverableId, submittedBy },
    });

    if (!existing) {
      const error = new Error('Grade not found');
      error.code = 'GRADE_NOT_FOUND';
      throw error;
    }

    // Update grade
    existing.scores = scores;
    existing.comments = comments || null;
    await existing.save();

    // Calculate final score
    const finalScore =
      scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;
    existing.finalScore = parseFloat(finalScore.toFixed(2));

    // Fire-and-forget: Log grading asynchronously
    FinalEvaluationService._logCommitteeGrade({
      gradeId: existing.id,
      groupId,
      deliverableId,
      reviewerId: submittedBy,
      finalScore: existing.finalScore,
      criteriaCount: scores.length,
      action: 'COMMITTEE_GRADE_UPDATED',
    }).catch((error) => {
      console.error('[FinalEvaluationService] Failed to log committee grade update:', error);
      // Silently fail
    });

    return existing;
  }

  /**
   * Get committee grade for a specific group and deliverable by a reviewer.
   *
   * @param {string} groupId - Group UUID
   * @param {string} deliverableId - Deliverable UUID
   * @param {string} submittedBy - User ID (reviewer)
   *
   * @returns {Promise<Object|null>} FinalEvaluationGrade or null
   */
  static async getCommitteeGrade(groupId, deliverableId, submittedBy) {
    return FinalEvaluationGrade.findOne({
      where: { groupId, deliverableId, submittedBy },
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'fullName'],
        },
      ],
    });
  }

  /**
   * List all committee grades for a specific group deliverable.
   *
   * @param {string} groupId - Group UUID
   * @param {string} deliverableId - Deliverable UUID
   *
   * @returns {Promise<Array>} Array of FinalEvaluationGrades
   */
  static async listCommitteeGradesForDeliverable(groupId, deliverableId) {
    return FinalEvaluationGrade.findAll({
      where: { groupId, deliverableId },
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'fullName'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * Internal: Log committee grading to D6 (Audit Logs).
   *
   * Creates an AuditLog entry with action COMMITTEE_GRADE_SUBMITTED or COMMITTEE_GRADE_UPDATED.
   *
   * @param {Object} eventData
   * @param {string} eventData.gradeId - FinalEvaluationGrade UUID
   * @param {string} eventData.groupId - Group UUID
   * @param {string} eventData.deliverableId - Deliverable UUID
   * @param {string} eventData.reviewerId - User ID (committee member)
   * @param {number} eventData.finalScore - Average score
   * @param {number} eventData.criteriaCount - Number of criteria scored
   * @param {string} eventData.action - COMMITTEE_GRADE_SUBMITTED or COMMITTEE_GRADE_UPDATED
   *
   * @returns {Promise<AuditLog>}
   */
  static async _logCommitteeGrade({
    gradeId,
    groupId,
    deliverableId,
    reviewerId,
    finalScore,
    criteriaCount,
    action,
  }) {
    return AuditLog.create({
      action,
      actorId: reviewerId,
      targetType: 'COMMITTEE_GRADE',
      targetId: gradeId,
      metadata: {
        groupId,
        deliverableId,
        reviewerId,
        finalScore: parseFloat(finalScore.toFixed(2)),
        criteriaCount,
        eventType: 'FINAL_EVALUATION_EVENT',
        timestamp: new Date().toISOString(),
      },
    });
  }

  // ==================== ADVISOR SOFT GRADES (Issue #366) ====================

  /**
   * Submit advisor soft grade for a group deliverable.
   *
   * @param {Object} params
   * @param {string} params.groupId - Group UUID
   * @param {string} params.deliverableId - Deliverable UUID
   * @param {string} params.advisorId - User ID (assigned advisor)
   * @param {Array} params.scores - Array of {criterionId, value, note}
   * @param {string} params.comments - Optional feedback
   *
   * @returns {Promise<Object>} Created AdvisorGrade
   * @throws {Error} Validation errors with code property
   */
  static async submitAdvisorGrade({
    groupId,
    deliverableId,
    advisorId,
    scores,
    comments,
  }) {
    // Validate inputs
    if (!groupId || typeof groupId !== 'string') {
      const error = new Error('Invalid group ID');
      error.code = 'INVALID_GROUP_ID';
      throw error;
    }

    if (!deliverableId || typeof deliverableId !== 'string') {
      const error = new Error('Invalid deliverable ID');
      error.code = 'INVALID_DELIVERABLE_ID';
      throw error;
    }

    if (!advisorId) {
      const error = new Error('Advisor user ID is required');
      error.code = 'INVALID_ADVISOR_ID';
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

    // Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    // Finalization lock check
    if (group.status === 'FINALIZED') {
      const error = new Error('Cannot submit grade after finalization');
      error.code = 'FINALIZATION_LOCK_ERROR';
      error.statusCode = 403;
      throw error;
    }

    // Verify deliverable exists and belongs to this group
    const deliverable = await Deliverable.findByPk(deliverableId);
    if (!deliverable) {
      const error = new Error('Deliverable not found');
      error.code = 'DELIVERABLE_NOT_FOUND';
      throw error;
    }

    if (deliverable.groupId !== groupId) {
      const error = new Error('Deliverable does not belong to this group');
      error.code = 'DELIVERABLE_GROUP_MISMATCH';
      throw error;
    }

    // Duplicate advisor guard: check if this advisor already submitted
    const existing = await AdvisorGrade.findOne({
      where: { groupId, deliverableId, advisorId },
    });

    if (existing) {
      const error = new Error('This advisor has already submitted a grade for this deliverable');
      error.code = 'ADVISOR_GRADE_EXISTS';
      error.statusCode = 409;
      throw error;
    }

    // Create new advisor grade
    const grade = await AdvisorGrade.create({
      groupId,
      deliverableId,
      advisorId,
      scores,
      comments: comments || null,
    });

    // Calculate final score
    const finalScore =
      scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;
    grade.finalScore = parseFloat(finalScore.toFixed(2));

    // Fire-and-forget: Log asynchronously
    FinalEvaluationService._logAdvisorGrade({
      gradeId: grade.id,
      groupId,
      deliverableId,
      advisorId,
      finalScore: grade.finalScore,
      criteriaCount: scores.length,
      action: 'ADVISOR_GRADE_SUBMITTED',
    }).catch((error) => {
      console.error('[FinalEvaluationService] Failed to log advisor grade:', error);
    });

    return grade;
  }

  /**
   * Update advisor soft grade for a group deliverable.
   *
   * @param {Object} params
   * @param {string} params.groupId - Group UUID
   * @param {string} params.deliverableId - Deliverable UUID
   * @param {string} params.advisorId - User ID (assigned advisor)
   * @param {Array} params.scores - Array of {criterionId, value, note}
   * @param {string} params.comments - Optional feedback
   *
   * @returns {Promise<Object>} Updated AdvisorGrade
   * @throws {Error} Validation errors with code property
   */
  static async updateAdvisorGrade({
    groupId,
    deliverableId,
    advisorId,
    scores,
    comments,
  }) {
    // Validate inputs (same as submit)
    if (!groupId || typeof groupId !== 'string') {
      const error = new Error('Invalid group ID');
      error.code = 'INVALID_GROUP_ID';
      throw error;
    }

    if (!deliverableId || typeof deliverableId !== 'string') {
      const error = new Error('Invalid deliverable ID');
      error.code = 'INVALID_DELIVERABLE_ID';
      throw error;
    }

    if (!advisorId) {
      const error = new Error('Advisor user ID is required');
      error.code = 'INVALID_ADVISOR_ID';
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

    // Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    // Finalization lock check
    if (group.status === 'FINALIZED') {
      const error = new Error('Cannot update grade after finalization');
      error.code = 'FINALIZATION_LOCK_ERROR';
      error.statusCode = 403;
      throw error;
    }

    // Verify deliverable exists and belongs to group
    const deliverable = await Deliverable.findByPk(deliverableId);
    if (!deliverable) {
      const error = new Error('Deliverable not found');
      error.code = 'DELIVERABLE_NOT_FOUND';
      throw error;
    }

    if (deliverable.groupId !== groupId) {
      const error = new Error('Deliverable does not belong to this group');
      error.code = 'DELIVERABLE_GROUP_MISMATCH';
      throw error;
    }

    // Find existing grade
    const existing = await AdvisorGrade.findOne({
      where: { groupId, deliverableId, advisorId },
    });

    if (!existing) {
      const error = new Error('Grade not found');
      error.code = 'GRADE_NOT_FOUND';
      throw error;
    }

    // Update grade
    existing.scores = scores;
    existing.comments = comments || null;
    await existing.save();

    // Calculate final score
    const finalScore =
      scores.reduce((sum, s) => sum + (s.value || 0), 0) / scores.length;
    existing.finalScore = parseFloat(finalScore.toFixed(2));

    // Fire-and-forget: Log asynchronously
    FinalEvaluationService._logAdvisorGrade({
      gradeId: existing.id,
      groupId,
      deliverableId,
      advisorId,
      finalScore: existing.finalScore,
      criteriaCount: scores.length,
      action: 'ADVISOR_GRADE_UPDATED',
    }).catch((error) => {
      console.error('[FinalEvaluationService] Failed to log advisor grade update:', error);
    });

    return existing;
  }

  /**
   * Get grades for a group (both advisor and committee).
   *
   * @param {string} groupId - Group UUID
   *
   * @returns {Promise<Object>} { advisorGrades, committeeGrades }
   */
  static async getGradesForGroup(groupId) {
    const [advisorGrades, committeeGrades] = await Promise.all([
      AdvisorGrade.findAll({
        where: { groupId },
        include: [
          {
            model: User,
            as: 'advisor',
            attributes: ['id', 'fullName'],
          },
          {
            model: Deliverable,
            as: 'deliverable',
            attributes: ['id', 'type'],
          },
        ],
        order: [['createdAt', 'DESC']],
      }),
      FinalEvaluationGrade.findAll({
        where: { groupId },
        include: [
          {
            model: User,
            as: 'reviewer',
            attributes: ['id', 'fullName'],
          },
          {
            model: Deliverable,
            as: 'deliverable',
            attributes: ['id', 'type'],
          },
        ],
        order: [['createdAt', 'DESC']],
      }),
    ]);

    return { advisorGrades, committeeGrades };
  }

  /**
   * Internal: Log advisor grading to D6 (Audit Logs).
   *
   * @param {Object} eventData
   * @param {string} eventData.gradeId - AdvisorGrade UUID
   * @param {string} eventData.groupId - Group UUID
   * @param {string} eventData.deliverableId - Deliverable UUID
   * @param {string} eventData.advisorId - User ID (advisor)
   * @param {number} eventData.finalScore - Average score
   * @param {number} eventData.criteriaCount - Number of criteria scored
   * @param {string} eventData.action - ADVISOR_GRADE_SUBMITTED or ADVISOR_GRADE_UPDATED
   *
   * @returns {Promise<AuditLog>}
   */
  static async _logAdvisorGrade({
    gradeId,
    groupId,
    deliverableId,
    advisorId,
    finalScore,
    criteriaCount,
    action,
  }) {
    return AuditLog.create({
      action,
      actorId: advisorId,
      targetType: 'ADVISOR_GRADE',
      targetId: gradeId,
      metadata: {
        groupId,
        deliverableId,
        advisorId,
        finalScore: parseFloat(finalScore.toFixed(2)),
        criteriaCount,
        eventType: 'ADVISOR_GRADING_EVENT',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

module.exports = FinalEvaluationService;
