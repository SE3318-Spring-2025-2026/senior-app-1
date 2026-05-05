/**
 * services/submissionService.js
 *
 * Business logic for deliverable submissions (D6 audit logging, Issue #257)
 * and committee review document retrieval (D5, Issue #249).
 */

const { Deliverable, AuditLog, GradingRubric, Grade, User, Group, DeliverableWeightConfiguration } = require('../models');

class SubmissionService {
  static async submitDeliverable({ groupId, type, content, images, submitBy }) {
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

    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    const existing = await Deliverable.findOne({ where: { groupId, type } });

    let deliverable;
    if (existing) {
      existing.content = content.trim();
      existing.images = images || [];
      existing.version = (existing.version || 1) + 1;
      existing.status = 'SUBMITTED';
      await existing.save();
      deliverable = existing;
    } else {
      deliverable = await Deliverable.create({
        groupId,
        type,
        content: content.trim(),
        images: images || [],
        version: 1,
        status: 'SUBMITTED',
      });
    }

    SubmissionService._logSubmission({
      deliverableId: deliverable.id,
      groupId,
      deliverableType: type,
      version: deliverable.version,
      status: 'SUBMITTED',
      submittedBy: submitBy,
    }).catch((error) => {
      console.error('[SubmissionService] Failed to log submission:', error);
    });

    return deliverable;
  }

  static async _logSubmission({ deliverableId, groupId, deliverableType, version, status, submittedBy }) {
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

  static async fetchSubmissionForReview(submissionId) {
    const deliverable = await Deliverable.findByPk(submissionId, {
       include: [{ model: Group, attributes: ['id', 'name', 'leaderId'] }],
      //include: [{ model: Group, as: 'group', attributes: ['id', 'name', 'leaderId'] }],
    });

    if (!deliverable) {
      const error = new Error('Submission not found');
      error.code = 'SUBMISSION_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const rubric = await GradingRubric.findOne({
      where: { deliverableType: deliverable.type, isActive: true },
      order: [['createdAt', 'DESC']],
      limit: 1,
    });

    const weightConfig = await DeliverableWeightConfiguration.findOne({
      where: { deliverableType: deliverable.type, isActive: true },
      order: [['createdAt', 'DESC']],
      limit: 1,
    });

    const previousGrades = await Grade.findAll({
      where: { deliverableId: submissionId },
      include: [{ model: User, as: 'grader', attributes: ['id', 'fullName', 'email', 'role'] }],
      order: [['createdAt', 'DESC']],
    });

    return {
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
        ? { id: rubric.id, name: rubric.name, deliverableType: rubric.deliverableType, criteria: rubric.criteria || [] }
        : null,
      weightConfiguration: weightConfig
        ? { id: weightConfig.id, deliverableType: weightConfig.deliverableType, weight: weightConfig.weight, description: weightConfig.description, sprintNumber: weightConfig.sprintNumber }
        : null,
      previousGrades: previousGrades.map((grade) => ({
        id: grade.id,
        gradeType: grade.gradeType,
        scores: grade.scores || [],
        comments: grade.comments,
        gradedBy: { id: grade.grader?.id, name: grade.grader?.fullName, email: grade.grader?.email, role: grade.grader?.role },
        submittedAt: grade.createdAt,
      })),
    };
  }

  static async getSubmissionById(submissionId) {
    return Deliverable.findByPk(submissionId);
  }

  static async canUserAccessSubmission(submissionId, user) {
    if (!user) return false;
    if (['ADMIN', 'COORDINATOR'].includes(user.role)) return true;

    const submission = await Deliverable.findByPk(submissionId);
    if (!submission) return false;

    if (user.role === 'PROFESSOR') return true;

    if (user.role === 'STUDENT') {
      return String(submission.groupId) === String(user.groupId);
    }

    return false;
  }

  static async listAllSubmissions() {
    const submissions = await Deliverable.findAll({
      attributes: ['id', 'groupId', 'type', 'status', 'version', 'createdAt', 'updatedAt'],
      include: [{ model: Group, attributes: ['id', 'name', 'leaderId'] }],
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

  static async listGroupSubmissions(groupId) {
    return Deliverable.findAll({
      where: { groupId },
      order: [['type', 'ASC'], ['createdAt', 'DESC']],
    });
  }
}

module.exports = SubmissionService;
