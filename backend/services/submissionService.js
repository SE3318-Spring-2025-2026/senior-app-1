/**
 * services/submissionService.js
 *
 * Business logic for handling deliverable submissions.
 * Implements async audit logging to D6 (Issue #257, Connector f13).
 */

const { Deliverable, AuditLog, Group, User } = require('../models');

class SubmissionService {
  /**
   * Submit a new deliverable for a group.
   * 
   * Fire-and-forget async logging: Audit events are dispatched asynchronously
   * and do not block the API response. Logging failures are silently caught.
   *
   * @param {Object} params
   * @param {string} params.groupId - Group UUID
   * @param {string} params.type - 'PROPOSAL' or 'SOW'
   * @param {string} params.content - Markdown content
   * @param {Array} params.images - Array of image URLs (optional)
   * @param {string} params.submitBy - User ID (team leader)
   *
   * @returns {Promise<Object>} Created Deliverable
   * @throws {Error} Validation errors with code property
   */
  static async submitDeliverable({ groupId, type, content, images, submitBy }) {
    // Validate inputs
    if (!groupId || typeof groupId !== 'string') {
      const error = new Error('Invalid group ID');
      error.code = 'INVALID_GROUP_ID';
      throw error;
    }

    if (!['PROPOSAL', 'SOW'].includes(type)) {
      const error = new Error('Invalid deliverable type. Must be PROPOSAL or SOW.');
      error.code = 'INVALID_DELIVERABLE_TYPE';
      throw error;
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      const error = new Error('Deliverable content is required.');
      error.code = 'INVALID_CONTENT';
      throw error;
    }

    if (!submitBy) {
      const error = new Error('Submitter user ID is required.');
      error.code = 'INVALID_SUBMITTER';
      throw error;
    }

    // Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    // Check for existing deliverable of this type
    const existing = await Deliverable.findOne({
      where: { groupId, type },
    });

    let deliverable;
    if (existing) {
      // Update existing deliverable
      existing.content = content.trim();
      existing.images = images || [];
      existing.version = (existing.version || 1) + 1;
      existing.status = 'SUBMITTED';
      await existing.save();
      deliverable = existing;
    } else {
      // Create new deliverable
      deliverable = await Deliverable.create({
        groupId,
        type,
        content: content.trim(),
        images: images || [],
        version: 1,
        status: 'SUBMITTED',
      });
    }

    // Fire-and-forget: Log submission asynchronously without blocking response
    SubmissionService._logSubmission({
      deliverableId: deliverable.id,
      groupId,
      deliverableType: type,
      version: deliverable.version,
      status: 'SUBMITTED',
      submittedBy: submitBy,
    }).catch((error) => {
      console.error('[SubmissionService] Failed to log submission:', error);
      // Silently fail to prevent blocking the main response
    });

    return deliverable;
  }

  /**
   * Internal: Log deliverable submission to D6 (Audit Logs).
   * 
   * Creates an AuditLog entry with action=DELIVERABLE_SUBMITTED and metadata
   * identifying this as a SUBMISSION_EVENT.
   *
   * @param {Object} eventData
   * @param {string} eventData.deliverableId - Deliverable UUID
   * @param {string} eventData.groupId - Group ID
   * @param {string} eventData.deliverableType - 'PROPOSAL' or 'SOW'
   * @param {number} eventData.version - Version number
   * @param {string} eventData.status - Current status
   * @param {string} eventData.submittedBy - User ID
   *
   * @returns {Promise<AuditLog>}
   */
  static async _logSubmission({
    deliverableId,
    groupId,
    deliverableType,
    version,
    status,
    submittedBy,
  }) {
    return AuditLog.create({
      action: 'DELIVERABLE_SUBMITTED',
      actorId: submittedBy,
      targetType: 'DELIVERABLE',
      targetId: deliverableId,
      metadata: {
        deliverableType,
        documentRef: `${deliverableType}-${groupId}-v${version}`,
        groupId,
        submissionStatus: status,
        eventType: 'SUBMISSION_EVENT',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Get a submission for review with all context.
   *
   * @param {string} deliverableId - Deliverable UUID
   * @returns {Promise<Object|null>} Deliverable with group context
   */
  static async getSubmissionForReview(deliverableId) {
    const deliverable = await Deliverable.findByPk(deliverableId, {
      include: [
        {
          model: Group,
          as: 'group',
          attributes: ['id', 'name', 'leaderId'],
        },
      ],
    });

    return deliverable;
  }

  /**
   * List all submissions (for coordinator/professor access).
   *
   * @returns {Promise<Array>}
   */
  static async listAllSubmissions() {
    return Deliverable.findAll({
      include: [
        {
          model: Group,
          as: 'group',
          attributes: ['id', 'name', 'leaderId'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  /**
   * List submissions for a specific group.
   *
   * @param {string} groupId - Group UUID
   * @returns {Promise<Array>}
   */
  static async listGroupSubmissions(groupId) {
    return Deliverable.findAll({
      where: { groupId },
      order: [['type', 'ASC'], ['createdAt', 'DESC']],
    });
  }

  /**
   * Check if user can access a submission.
   *
   * @param {string} deliverableId - Deliverable UUID
   * @param {Object} user - User object with id and role
   * @returns {Promise<boolean>}
   */
  static async canUserAccessSubmission(deliverableId, user) {
    const deliverable = await Deliverable.findByPk(deliverableId);
    if (!deliverable) return false;

    // Coordinator/Admin can access all
    if (['COORDINATOR', 'ADMIN'].includes(user.role)) {
      return true;
    }

    // Professor (advisor) can access their group's submissions
    if (user.role === 'PROFESSOR') {
      const group = await Group.findByPk(deliverable.groupId);
      return group && group.advisorId === user.id;
    }

    // Student can access own group's submissions
    if (user.role === 'STUDENT') {
      const group = await Group.findByPk(deliverable.groupId);
      return group && group.memberIds && group.memberIds.map(String).includes(String(user.id));
    }

    return false;
  }
}

module.exports = SubmissionService;
