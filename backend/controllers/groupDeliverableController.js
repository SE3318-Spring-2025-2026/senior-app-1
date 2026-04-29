const { body, param, validationResult } = require('express-validator');
const { GroupDeliverable, Group } = require('../models'); // direkt import

const STORAGE_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => {
      const err = new Error('Document storage timed out.');
      err.code = 'STORAGE_TIMEOUT';
      reject(err);
    }, ms)
  );
  return Promise.race([promise, timeout]);
}

exports.submitDeliverableValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
  body('markdownContent').optional().isString(),
  body('imageUrls').optional().isArray(),
  body('imageUrls.*').optional().isURL().withMessage('Each imageUrl must be a valid URL'),
  body('sprintNumber').optional().isInt({ min: 1 }).withMessage('sprintNumber must be a positive integer'),
  body('deliverableType').optional().isString().trim().notEmpty().withMessage('deliverableType must be a string'),
];

exports.submitDeliverable = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'INVALID_DELIVERABLE_INPUT',
      message: 'Deliverable payload failed validation.',
      errors: errors.array(),
    });
  }

  try {
    const { groupId } = req.params;
    const { markdownContent, imageUrls, sprintNumber, deliverableType } = req.body;

    // Group membership check
    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }

    const userId = String(req.user.id);
    const isLeader = String(group.leaderId) === userId;
    const isMember = Array.isArray(group.memberIds) && group.memberIds.map((id) => String(id)).includes(userId);

    if (!isLeader && !isMember) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a member of this group' });
    }

    const deliverable = await withTimeout(
      GroupDeliverable.create({
        groupId,
        markdownContent: markdownContent ?? null,
        imageUrls: imageUrls ?? [],
        sprintNumber: sprintNumber ?? null,
        deliverableType: deliverableType ?? null,
      }),
      STORAGE_TIMEOUT_MS
    );

    return res.status(201).json({
      code: 'SUCCESS',
      message: 'Deliverable stored successfully.',
      data: {
        documentRef: deliverable.documentRef,
        groupId: deliverable.groupId,
        sprintNumber: deliverable.sprintNumber,
        deliverableType: deliverable.deliverableType,
        createdAt: deliverable.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 'STORAGE_TIMEOUT') {
      console.error('D5 storage timeout:', error);
      return res.status(500).json({
        code: 'STORAGE_TIMEOUT',
        message: 'Document storage timed out. Please try again.',
      });
    }
    console.error('Error in submitDeliverable:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};