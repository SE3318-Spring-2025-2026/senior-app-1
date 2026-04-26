/**
 * services/submissionService.js
 *
 * Service for handling submission document retrieval for committee review (D5 Document Retrieval).
 * Fetches deliverable content, rubric, and previous grades as a SubmissionReviewPacket.
 */

const { Deliverable, GradingRubric, Grade, User, Group } = require('../models');

class SubmissionService {
  /**
   * Fetch a submission with all related data for committee review
   * Returns SubmissionReviewPacket containing:
   * - Deliverable (content + images)
   * - Associated rubric
   * - Previous grades (if any)
   * - Group information
   *
   * @param {string} submissionId - UUID of the deliverable/submission
   * @returns {Promise<Object>} SubmissionReviewPacket
   * @throws {Error} if submission not found (mapped to 404)
   */
  static async fetchSubmissionForReview(submissionId) {
    // 1. Fetch deliverable
    const deliverable = await Deliverable.findByPk(submissionId, {
      include: [
        {
          model: Group,
          attributes: ['id', 'name', 'leaderId'],
        },
      ],
    });

    if (!deliverable) {
      const error = new Error('Submission not found');
      error.code = 'SUBMISSION_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 2. Fetch applicable rubric for this deliverable type
    const rubric = await GradingRubric.findOne({
      where: {
        deliverableType: deliverable.type,
        isActive: true,
      },
      order: [['createdAt', 'DESC']],
      limit: 1,
    });

    // 3. Fetch previous grades with grader information
    const previousGrades = await Grade.findAll({
      where: { deliverableId: submissionId },
      include: [
        {
          model: User,
          as: 'grader',
          attributes: ['id', 'fullName', 'email', 'role'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // 4. Assemble SubmissionReviewPacket
    const packet = {
      submission: {
        id: deliverable.id,
        groupId: deliverable.groupId,
        groupName: deliverable.Group?.name,
        leaderId: deliverable.Group?.leaderId,
        type: deliverable.type,
        status: deliverable.status,
        version: deliverable.version,
        submittedAt: deliverable.createdAt,
        lastUpdatedAt: deliverable.updatedAt,
      },
      document: {
        content: deliverable.content,
        images: deliverable.images || [],
      },
      rubric: rubric
        ? {
            id: rubric.id,
            name: rubric.name,
            deliverableType: rubric.deliverableType,
            criteria: rubric.criteria || [],
          }
        : null,
      previousGrades: previousGrades.map((grade) => ({
        id: grade.id,
        gradeType: grade.gradeType,
        scores: grade.scores || [],
        comments: grade.comments,
        gradedBy: {
          id: grade.grader?.id,
          name: grade.grader?.fullName,
          email: grade.grader?.email,
          role: grade.grader?.role,
        },
        submittedAt: grade.createdAt,
      })),
    };

    return packet;
  }

  /**
   * Fetch submission by ID with minimal validation
   * Used for existence checks
   *
   * @param {string} submissionId - UUID of deliverable
   * @returns {Promise<Object|null>} Deliverable record or null
   */
  static async getSubmissionById(submissionId) {
    return Deliverable.findByPk(submissionId);
  }

  /**
   * Check if a user has access to view a submission
   * Committee members and advisors can view; students can only view their own group's
   *
   * @param {string} submissionId - UUID of deliverable
   * @param {Object} user - User object with id and role
   * @returns {Promise<boolean>} true if user has access
   */
  static async canUserAccessSubmission(submissionId, user) {
    if (!user) return false;

    // Admins and coordinators can access any submission
    if (['ADMIN', 'COORDINATOR'].includes(user.role)) {
      return true;
    }

    const submission = await Deliverable.findByPk(submissionId);
    if (!submission) return false;

    // Professors can access submissions (assumed to be committee members)
    if (user.role === 'PROFESSOR') {
      return true;
    }

    // Students can only view submissions from their own group
    if (user.role === 'STUDENT') {
      return String(submission.groupId) === String(user.groupId);
    }

    return false;
  }

  /**
   * List all submissions (for admins, coordinators, and professors)
   *
   * @returns {Promise<Array>} Submission summaries
   */
  static async listAllSubmissions() {
    const submissions = await Deliverable.findAll({
      attributes: ['id', 'groupId', 'type', 'status', 'version', 'createdAt', 'updatedAt'],
      include: [
        {
          model: Group,
          attributes: ['id', 'name', 'leaderId'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return submissions.map((sub) => ({
      id: sub.id,
      groupId: sub.groupId,
      groupName: sub.Group?.name,
      type: sub.type,
      status: sub.status,
      version: sub.version,
      submittedAt: sub.createdAt,
    }));
  }

  /**
   * List submissions for a specific group
   *
   * @param {string} groupId - UUID of group
   * @returns {Promise<Array>} Submission summaries for the group
   */
  static async listGroupSubmissions(groupId) {
    const submissions = await Deliverable.findAll({
      where: { groupId },
      attributes: ['id', 'groupId', 'type', 'status', 'version', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    return submissions.map((sub) => ({
      id: sub.id,
      groupId: sub.groupId,
      type: sub.type,
      status: sub.status,
      version: sub.version,
      submittedAt: sub.createdAt,
    }));
  }
}

module.exports = SubmissionService;
