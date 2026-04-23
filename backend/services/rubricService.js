/**
 * services/rubricService.js
 *
 * Service for managing grading rubrics.
 * Includes audit logging for rubric creation (Issue #255, Connector f12).
 */

const { GradingRubric, AuditLog } = require('../models');

class RubricService {
  /**
   * Create a new grading rubric
   * Logs the action asynchronously to D6 (Audit Logs)
   *
   * @param {Object} params
   * @param {string} params.deliverableType - 'PROPOSAL' or 'SOW'
   * @param {string} params.name - Rubric name/description
   * @param {Array} params.criteria - Array of {question, type, weight}
   * @param {number} params.actorId - User ID creating the rubric (coordinator)
   * @returns {Promise<Object>} Created rubric
   */
  static async createRubric({ deliverableType, name, criteria, actorId }) {
    // Validate input
    if (!deliverableType || !['PROPOSAL', 'SOW'].includes(deliverableType)) {
      const error = new Error('Invalid deliverable type');
      error.code = 'INVALID_DELIVERABLE_TYPE';
      throw error;
    }

    if (!name || name.trim().length === 0) {
      const error = new Error('Rubric name is required');
      error.code = 'INVALID_RUBRIC_NAME';
      throw error;
    }

    if (!Array.isArray(criteria) || criteria.length === 0) {
      const error = new Error('At least one criterion is required');
      error.code = 'INVALID_CRITERIA';
      throw error;
    }

    // Validate criteria format
    criteria.forEach((criterion, index) => {
      if (!criterion.question || !criterion.type || criterion.weight === undefined) {
        const error = new Error(`Criterion ${index} missing required fields`);
        error.code = 'INVALID_CRITERION_FORMAT';
        throw error;
      }

      if (!['BINARY', 'SOFT'].includes(criterion.type)) {
        const error = new Error(`Criterion ${index} has invalid type`);
        error.code = 'INVALID_CRITERION_TYPE';
        throw error;
      }

      if (typeof criterion.weight !== 'number' || criterion.weight < 0 || criterion.weight > 1) {
        const error = new Error(`Criterion ${index} weight must be 0-1`);
        error.code = 'INVALID_CRITERION_WEIGHT';
        throw error;
      }
    });

    // Create rubric
    const rubric = await GradingRubric.create({
      deliverableType,
      name: name.trim(),
      criteria,
      isActive: true,
    });

    // Log the creation asynchronously (fire-and-forget)
    // Issue #255: Connector f12 - Log Configuration
    RubricService._logRubricCreation({
      rubricId: rubric.id,
      deliverableType,
      rubricName: name,
      criteriaCount: criteria.length,
      actorId,
    }).catch((err) => {
      console.error('[RubricService] Failed to log rubric creation:', err);
      // Don't throw - logging should not block the API response
    });

    return rubric;
  }

  /**
   * Asynchronously log rubric creation to D6 (Audit Logs)
   * Fire-and-forget pattern - does not block the main request
   *
   * @private
   * @param {Object} eventData - Event details to log
   */
  static async _logRubricCreation(eventData) {
    try {
      await AuditLog.create({
        action: 'RUBRIC_CREATED',
        actorId: eventData.actorId,
        targetType: 'GRADING_RUBRIC',
        targetId: eventData.rubricId,
        metadata: {
          deliverableType: eventData.deliverableType,
          rubricName: eventData.rubricName,
          criteriaCount: eventData.criteriaCount,
          eventType: 'RUBRIC_CONFIGURATION',
          timestamp: new Date().toISOString(),
        },
      });

      console.log(
        `[RubricService] Rubric creation logged: ${eventData.rubricId} by actor ${eventData.actorId}`
      );
    } catch (error) {
      console.error('[RubricService] Audit log creation failed:', error);
      throw error; // Re-throw for caller's fire-and-forget to catch
    }
  }

  /**
   * Get active rubric for a deliverable type
   *
   * @param {string} deliverableType - 'PROPOSAL' or 'SOW'
   * @returns {Promise<Object|null>} Active rubric or null
   */
  static async getActiveRubric(deliverableType) {
    return GradingRubric.findOne({
      where: {
        deliverableType,
        isActive: true,
      },
      order: [['createdAt', 'DESC']],
      limit: 1,
    });
  }

  /**
   * List all rubrics (active and inactive)
   *
   * @returns {Promise<Array>} List of rubrics
   */
  static async listRubrics() {
    return GradingRubric.findAll({
      order: [['deliverableType', 'ASC'], ['createdAt', 'DESC']],
    });
  }

  /**
   * Deactivate a rubric
   *
   * @param {string} rubricId - Rubric ID to deactivate
   * @param {number} actorId - Coordinator user ID
   * @returns {Promise<Object>} Updated rubric
   */
  static async deactivateRubric(rubricId, actorId) {
    const rubric = await GradingRubric.findByPk(rubricId);

    if (!rubric) {
      const error = new Error('Rubric not found');
      error.code = 'RUBRIC_NOT_FOUND';
      throw error;
    }

    await rubric.update({ isActive: false });

    // Log deactivation asynchronously
    RubricService._logRubricDeactivation({
      rubricId,
      deliverableType: rubric.deliverableType,
      actorId,
    }).catch((err) => {
      console.error('[RubricService] Failed to log rubric deactivation:', err);
    });

    return rubric;
  }

  /**
   * Asynchronously log rubric deactivation to D6
   *
   * @private
   */
  static async _logRubricDeactivation(eventData) {
    await AuditLog.create({
      action: 'RUBRIC_DEACTIVATED',
      actorId: eventData.actorId,
      targetType: 'GRADING_RUBRIC',
      targetId: eventData.rubricId,
      metadata: {
        deliverableType: eventData.deliverableType,
        eventType: 'RUBRIC_CONFIGURATION',
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[RubricService] Rubric deactivation logged: ${eventData.rubricId}`);
  }
}

module.exports = RubricService;
