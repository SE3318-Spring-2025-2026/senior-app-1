const { body, param, validationResult } = require('express-validator');
const GroupService = require('../services/groupService');
const groupsRepository = require('../repositories/groupsRepository');

/**
 * PATCH /api/v1/groups/:groupId/membership/coordinator — P25 / f19 (coordinator override)
 */
exports.patchCoordinatorMembership = async (req, res) => {
  const { groupId } = req.params;
  if (!groupId || String(groupId).trim() === '') {
    return res.status(404).json({
      message: 'Group not found',
      code: groupsRepository.CODES.GROUP_NOT_FOUND,
    });
  }

  const { action, studentId } = req.body || {};
  if (action !== 'ADD' && action !== 'REMOVE') {
    return res.status(400).json({
      message: 'Invalid action',
      code: groupsRepository.CODES.INVALID_ACTION,
    });
  }

  if (typeof studentId !== 'string' || !/^[0-9]{11}$/.test(studentId.trim())) {
    return res.status(400).json({
      message: 'Invalid studentId',
      code: 'INVALID_PAYLOAD',
    });
  }

  try {
    const group = await groupsRepository.applyCoordinatorChange(
      groupId,
      action,
      studentId.trim(),
    );
    return res.status(200).json(group);
  } catch (err) {
    if (!err.code) {
      throw err;
    }
    switch (err.code) {
      case groupsRepository.CODES.GROUP_NOT_FOUND:
        return res.status(404).json({ message: err.message, code: err.code });
      case groupsRepository.CODES.STUDENT_NOT_FOUND:
        return res.status(400).json({ message: err.message, code: err.code });
      case groupsRepository.CODES.INVALID_ACTION:
        return res.status(400).json({ message: err.message, code: err.code });
      case groupsRepository.CODES.LEADER_REMOVAL_REQUIRES_REASSIGNMENT:
        return res.status(409).json({ message: err.message, code: err.code });
      default:
        throw err;
    }
  }
};

/**
 * Validation middleware for creating a group
 */
exports.createGroupValidation = [
  body('groupName')
    .trim()
    .notEmpty()
    .withMessage('Group name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Group name must be between 1 and 255 characters'),
  body('maxMembers')
    .isInt({ min: 1, max: 10 })
    .withMessage('Max members must be between 1 and 10'),
];

/**
 * Create a new group
 * POST /api/v1/groups
 */
exports.createGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });
    }

    const { groupName, maxMembers } = req.body;
    const leaderId = req.user?.id || null;

    const group = await GroupService.createGroup(groupName, maxMembers, leaderId);

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Group created successfully',
      data: {
        groupId: group.id,
        groupName: group.name,
        leaderId: group.leaderId,
        maxMembers: group.maxMembers,
        status: group.status,
        members: group.memberIds || [],
      },
    });
  } catch (error) {
    console.error('Error in createGroup:', error);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * Validation middleware for finalizing membership
 */
exports.finalizeMembershipValidation = [
  param('groupId')
    .isInt({ min: 1 })
    .withMessage('Group ID must be a positive integer'),
  body('studentId')
    .matches(/^\d{11}$/)
    .withMessage('Student ID must be an 11-digit number'),
];

/**
 * Finalize membership for a student in a group
 * POST /api/v1/groups/:groupId/membership/finalize
 */
exports.finalizeMembership = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_STUDENT_ID',
        message: 'Invalid student ID format',
        errors: errors.array(),
      });
    }

    const { groupId } = req.params;
    const { studentId } = req.body;

    const result = await GroupService.finalizeMembership(parseInt(groupId, 10), studentId);

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Membership finalized successfully',
      data: {
        success: true,
        studentId: result.studentId,
        totalMembers: result.totalMembers,
        maxMembers: result.maxMembers,
        groupId: result.groupId,
      },
    });
  } catch (error) {
    console.error('Error in finalizeMembership:', error);

    if (error.code === 'DUPLICATE_MEMBER') {
      return res.status(400).json({
        code: 'DUPLICATE_MEMBER',
        message: 'Student is already a member of this group',
      });
    }

    if (error.code === 'MAX_MEMBERS_REACHED') {
      return res.status(400).json({
        code: 'MAX_MEMBERS_REACHED',
        message: 'Group has reached maximum member capacity',
      });
    }

    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    if (error.code === 'GROUP_FINALIZED') {
      return res.status(400).json({
        code: 'GROUP_FINALIZED',
        message: 'Group has been finalized and no longer accepts members',
      });
    }

    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};

/**
 * Validation middleware for getting group membership details
 */
exports.getGroupMembershipValidation = [
  param('groupId')
    .isInt({ min: 1 })
    .withMessage('Group ID must be a positive integer'),
];

/**
 * Get group membership details
 * GET /api/v1/groups/:groupId/membership
 */
exports.getGroupMembership = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid group ID',
        errors: errors.array(),
      });
    }

    const { groupId } = req.params;

    const groupData = await GroupService.getGroupMembership(parseInt(groupId, 10));

    const members = groupData.memberIds || [];
    res.status(200).json({
      code: 'SUCCESS',
      message: 'Group membership retrieved successfully',
      data: {
        groupId: groupData.id,
        groupName: groupData.name,
        status: groupData.status,
        maxMembers: groupData.maxMembers,
        members,
        currentMemberCount: members.length,
        availableSlots: (groupData.maxMembers ?? 0) - members.length,
      },
    });
  } catch (error) {
    console.error('Error in getGroupMembership:', error);

    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({
        code: 'GROUP_NOT_FOUND',
        message: 'Group not found',
      });
    }

    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};
