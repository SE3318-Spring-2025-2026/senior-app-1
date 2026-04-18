const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const GroupService = require('../services/groupService');
const { Group, User, Invitation, Professor, AuditLog } = require('../models');
const NotificationService = require('../services/notificationService');

// ==========================================
// ADVISOR RELEASE & ASSIGNMENT REMOVAL LOGIC
// ==========================================

// Validation for advisor release (PATCH)
exports.advisorReleaseValidation = [
  param('groupId').isUUID().withMessage('Group ID must be a valid UUID'),
];

// Validation for advisor assignment removal (DELETE)
exports.removeAdvisorAssignmentValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
];

/**
 * Advisor releases themselves from group
 * PATCH /api/v1/groups/:groupId/advisor-release
 * Auth: Only assigned advisor
 */
exports.advisorRelease = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });
    }
    const { groupId } = req.params;
    const user = req.user;
    
    const result = await GroupService.releaseAdvisor(groupId, user);
    
    return res.status(200).json({ code: 'SUCCESS', message: 'Advisor released from group', data: result });
  } catch (error) {
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }
    if (error.code === 'NOT_ASSIGNED_ADVISOR') {
      return res.status(403).json({ code: 'NOT_ASSIGNED_ADVISOR', message: 'You are not the assigned advisor for this group' });
    }
    if (error.code === 'NO_ADVISOR_ASSIGNED') {
      return res.status(400).json({ code: 'NO_ADVISOR_ASSIGNED', message: 'No advisor assigned to this group' });
    }
    console.error('Error in advisorRelease:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * Remove advisor assignment from a group
 * DELETE /api/v1/groups/:groupId/advisor-assignment
 * RBAC: ADMIN, COORDINATOR, or current advisor
 */
exports.removeAdvisorAssignment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid group ID', errors: errors.array() });
    }

    const { groupId } = req.params;
    const user = req.user;

    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }

    const allowedRoles = ['ADMIN', 'COORDINATOR'];
    if (!allowedRoles.includes(user.role) && String(group.advisorId) !== String(user.id)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not authorized to remove this advisor assignment' });
    }

    if (!group.advisorId) {
      return res.status(400).json({ code: 'NO_ADVISOR_ASSIGNED', message: 'No advisor assigned to this group' });
    }

    const prevAdvisorId = group.advisorId;
    group.advisorId = null;
    if (group.status === 'ADVISOR_ASSIGNED') {
      group.status = 'PENDING_ADVISOR';
    }
    await group.save();

    await AuditLog.create({
      action: 'ADVISOR_REMOVED',
      actorId: user.id,
      groupId: group.id,
      targetId: prevAdvisorId,
      metadata: JSON.stringify({ prevAdvisorId }),
    });

    if (group.leaderId) {
      await NotificationService.notifyMembershipAccepted({
        groupId: group.id,
        leaderId: group.leaderId,
        studentId: prevAdvisorId,
        totalMembers: group.memberIds?.length || 0,
        maxMembers: group.maxMembers,
      });
    }

    return res.status(200).json({
      code: 'SUCCESS',
      message: 'Advisor assignment removed successfully',
      data: {
        groupId: group.id,
        status: group.status,
        advisorId: group.advisorId,
      },
    });
  } catch (error) {
    console.error('Error in removeAdvisorAssignment:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

// ==========================================
// ORPHAN GROUP DELETION LOGIC
// ==========================================

exports.deleteOrphanGroupValidation = [
  param('groupId').isUUID().withMessage('Group ID must be a valid UUID'),
];

/**
 * Delete orphan group (no advisor assigned)
 * DELETE /api/v1/group-database/groups/:groupId
 * Auth: ADMIN or COORDINATOR
 */
exports.deleteOrphanGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });
    }

    const { groupId } = req.params;
    const result = await GroupService.deleteOrphanGroup(groupId, req.user);

    return res.status(200).json({ code: 'SUCCESS', message: 'Group deleted successfully', data: { groupId } });
  } catch (error) {
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }
    if (error.code === 'GROUP_HAS_ADVISOR') {
      return res.status(403).json({ code: 'GROUP_HAS_ADVISOR', message: 'Group has an assigned advisor and cannot be deleted' });
    }
    if (error.code === 'DATA_INTEGRITY_ERROR') {
      return res.status(409).json({ code: 'DATA_INTEGRITY_ERROR', message: error.message });
    }
    console.error('Error in deleteOrphanGroup:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

// ==========================================
// CORE GROUP MANAGEMENT LOGIC
// ==========================================

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
        members: group.memberIds,
      },
    });
  } catch (error) {
    if (error.code === 'ALREADY_IN_GROUP') {
      return res.status(409).json({
        code: 'ALREADY_IN_GROUP',
        message: 'You already belong to a group and cannot create another one.',
      });
    }

    console.error('Error in createGroup:', error);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.finalizeMembershipValidation = [
  param('groupId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Group ID is required'),
  body('studentId')
    .matches(/^\d{11}$/)
    .withMessage('Student ID must be an 11-digit number'),
];

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

    const result = await GroupService.finalizeMembership(groupId, studentId);

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
      return res.status(400).json({ code: 'DUPLICATE_MEMBER', message: 'Student is already a member of this group' });
    }
    if (error.code === 'MAX_MEMBERS_REACHED') {
      return res.status(400).json({ code: 'MAX_MEMBERS_REACHED', message: 'Group has reached maximum member capacity' });
    }
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }
    if (error.code === 'GROUP_FINALIZED') {
      return res.status(400).json({ code: 'GROUP_FINALIZED', message: 'Group has been finalized and no longer accepts members' });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.getGroupMembershipValidation = [
  param('groupId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Group ID is required'),
];

exports.getGroupMembership = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid group ID', errors: errors.array() });
    }

    const { groupId } = req.params;
    const groupData = await GroupService.getGroupMembership(groupId);

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Group membership retrieved successfully',
      data: {
        groupId: groupData.id,
        groupName: groupData.name,
        status: groupData.status,
        maxMembers: groupData.maxMembers,
        members: groupData.memberIds,
        currentMemberCount: groupData.memberIds.length,
        availableSlots: groupData.maxMembers - groupData.memberIds.length,
      },
    });
  } catch (error) {
    console.error('Error in getGroupMembership:', error);
    if (error.code === 'GROUP_NOT_FOUND') {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.getMyGroup = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Student account is required' });
    }

    const groups = await Group.findAll();
    const currentUserId = String(req.user.id);
    const mine = groups.find((group) => {
      const leaderMatches = String(group.leaderId || '') === currentUserId;
      const memberMatches = Array.isArray(group.memberIds) && group.memberIds.map((id) => String(id)).includes(currentUserId);
      return leaderMatches || memberMatches;
    });

    if (!mine) {
      return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'No group found for this student' });
    }

    return res.status(200).json({
      code: 'SUCCESS',
      data: {
        groupId: mine.id,
        groupName: mine.name,
        leaderId: mine.leaderId,
        maxMembers: mine.maxMembers,
        status: mine.status,
        members: mine.memberIds || [],
      },
    });
  } catch (error) {
    console.error('Error in getMyGroup:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.listGroups = async (req, res) => {
  try {
    const groups = await Group.findAll({ order: [['createdAt', 'DESC']] });

    const visibleGroups = req.user?.role === 'STUDENT'
      ? groups.filter((group) => {
        const currentUserId = String(req.user.id);
        const isLeader = String(group.leaderId || '') === currentUserId;
        const isMember = Array.isArray(group.memberIds) && group.memberIds.map((id) => String(id)).includes(currentUserId);
        return isLeader || isMember;
      })
      : groups;

    const userIds = new Set();
    visibleGroups.forEach((group) => {
      if (group.leaderId) userIds.add(Number(group.leaderId));
      if (group.advisorId) userIds.add(Number(group.advisorId));
      if (Array.isArray(group.memberIds)) group.memberIds.forEach((id) => userIds.add(Number(id)));
    });

    const users = userIds.size > 0
      ? await User.findAll({ where: { id: { [Op.in]: [...userIds] } }, attributes: ['id', 'fullName', 'studentId', 'email'] })
      : [];

    const usersById = new Map(users.map((user) => [String(user.id), user]));
    const professorRows = userIds.size > 0
      ? await Professor.findAll({ where: { userId: { [Op.in]: [...userIds] } }, attributes: ['userId', 'department', 'fullName'] })
      : [];
    const professorsByUserId = new Map(professorRows.map((professor) => [String(professor.userId), professor]));

    const data = visibleGroups.map((group) => {
      const leader = usersById.get(String(group.leaderId || ''));
      const advisorUser = usersById.get(String(group.advisorId || ''));
      const advisorProfessor = professorsByUserId.get(String(group.advisorId || ''));
      const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
      const currentUserId = String(req.user?.id || '');
      const isLeader = String(group.leaderId || '') === currentUserId;

      return {
        groupId: group.id,
        groupName: group.name,
        status: group.status,
        maxMembers: group.maxMembers,
        membershipRole: isLeader ? 'LEADER' : 'MEMBER',
        leader: leader ? { id: leader.id, fullName: leader.fullName, studentId: leader.studentId, email: leader.email } : null,
        advisor: advisorUser ? { id: advisorUser.id, fullName: advisorProfessor?.fullName || advisorUser.fullName, email: advisorUser.email, department: advisorProfessor?.department || null } : null,
        members: memberIds.map((id) => {
          const user = usersById.get(String(id));
          if (!user) return { id, fullName: 'Unknown Student', studentId: null, email: null };
          return { id: user.id, fullName: user.fullName, studentId: user.studentId, email: user.email };
        }),
      };
    });

    return res.status(200).json({ code: 'SUCCESS', data });
  } catch (error) {
    console.error('Error in listGroups:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.renameGroupValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
  body('groupName').optional().trim().notEmpty().withMessage('Group name cannot be empty').isLength({ min: 1, max: 255 }).withMessage('Group name must be between 1 and 255 characters'),
  body('maxMembers').optional().isInt({ min: 1, max: 10 }).withMessage('Max members must be between 1 and 10'),
];

exports.renameGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });

    if (!req.user || req.user.role !== 'STUDENT') return res.status(403).json({ code: 'FORBIDDEN', message: 'Student account is required' });

    const { groupId } = req.params;
    const { groupName, maxMembers } = req.body;

    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    if (String(group.leaderId || '') !== String(req.user.id)) return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group leader can rename the group' });

    if (typeof groupName === 'string') group.name = groupName.trim();

    if (maxMembers !== undefined) {
      const nextMax = Number(maxMembers);
      const memberCount = Array.isArray(group.memberIds) ? group.memberIds.length : 0;
      if (nextMax < memberCount) {
        return res.status(400).json({ code: 'INVALID_MAX_MEMBERS', message: 'Max members cannot be lower than current member count.' });
      }
      group.maxMembers = nextMax;
    }

    await group.save();

    return res.status(200).json({ code: 'SUCCESS', message: 'Group updated successfully', data: { groupId: group.id, groupName: group.name, maxMembers: group.maxMembers } });
  } catch (error) {
    console.error('Error in renameGroup:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.listJoinedGroups = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT') return res.status(403).json({ code: 'FORBIDDEN', message: 'Student account is required' });

    const currentUserId = String(req.user.id);
    const groups = await Group.findAll({ order: [['createdAt', 'DESC']] });

    const joined = groups.filter((group) => {
      const isLeader = String(group.leaderId || '') === currentUserId;
      const isMember = Array.isArray(group.memberIds) && group.memberIds.map((id) => String(id)).includes(currentUserId);
      return isMember && !isLeader;
    });

    return res.status(200).json({ code: 'SUCCESS', data: joined.map((group) => ({ groupId: group.id, groupName: group.name, leaderId: group.leaderId, members: group.memberIds || [] })) });
  } catch (error) {
    console.error('Error in listJoinedGroups:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.deleteGroupValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
];

exports.deleteGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });

    if (!req.user || req.user.role !== 'STUDENT') return res.status(403).json({ code: 'FORBIDDEN', message: 'Student account is required' });

    const { groupId } = req.params;
    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    if (String(group.leaderId || '') !== String(req.user.id)) return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the group leader can delete this group' });

    await Invitation.destroy({ where: { groupId: group.id } });
    await group.destroy();

    return res.status(200).json({ code: 'SUCCESS', message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error in deleteGroup:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.leaveGroupValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
];

exports.leaveGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });

    if (!req.user || req.user.role !== 'STUDENT') return res.status(403).json({ code: 'FORBIDDEN', message: 'Student account is required' });

    const { groupId } = req.params;
    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    if (String(group.leaderId || '') === String(req.user.id)) return res.status(400).json({ code: 'LEADER_CANNOT_LEAVE', message: 'Group leader cannot leave. Delete the group instead.' });

    const currentMembers = Array.isArray(group.memberIds) ? group.memberIds.map((id) => String(id)) : [];
    if (!currentMembers.includes(String(req.user.id))) return res.status(400).json({ code: 'NOT_A_MEMBER', message: 'You are not a member of this group' });

    group.memberIds = currentMembers.filter((id) => id !== String(req.user.id));
    await group.save();

    return res.status(200).json({ code: 'SUCCESS', message: 'You left the group successfully' });
  } catch (error) {
    console.error('Error in leaveGroup:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.kickMemberValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
  param('memberId').isInt({ min: 1 }).withMessage('Member ID must be a positive integer'),
];

exports.kickMember = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation failed', errors: errors.array() });

    if (!req.user || req.user.role !== 'STUDENT') return res.status(403).json({ code: 'FORBIDDEN', message: 'Student account is required' });

    const { groupId, memberId } = req.params;
    const normalizedMemberId = String(memberId);

    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    if (String(group.leaderId || '') !== String(req.user.id)) return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the group leader can remove members' });
    if (normalizedMemberId === String(req.user.id)) return res.status(400).json({ code: 'LEADER_REMOVE_BLOCKED', message: 'Leader cannot remove themselves from the group' });

    const currentMembers = Array.isArray(group.memberIds) ? group.memberIds.map((id) => String(id)) : [];
    if (!currentMembers.includes(normalizedMemberId)) return res.status(404).json({ code: 'MEMBER_NOT_FOUND', message: 'Selected student is not a member of this group' });

    group.memberIds = currentMembers.filter((id) => id !== normalizedMemberId);
    await group.save();

    await Invitation.destroy({ where: { groupId: group.id, inviteeId: Number(memberId) } });

    return res.status(200).json({ code: 'SUCCESS', message: 'Member removed from group' });
  } catch (error) {
    console.error('Error in kickMember:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

exports.dispatchInvitesValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
  body('studentIds').isArray({ min: 1 }).withMessage('studentIds must be a non-empty array'),
  body('studentIds.*').matches(/^\d{11}$/).withMessage('Each student ID must be an 11-digit number'),
];

exports.dispatchInvites = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Invalid invite payload',
        failures: errors.array().map((entry) => ({ studentId: String(entry.value || ''), reason: entry.msg })),
      });
    }

    if (!req.user || req.user.role !== 'STUDENT') return res.status(403).json({ code: 'FORBIDDEN', message: 'Student account is required' });

    const { groupId } = req.params;
    const requestedStudentIds = [...new Set(req.body.studentIds.map((item) => String(item).trim()))];

    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    if (String(group.leaderId || '') !== String(req.user.id)) return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the group leader can send invitations' });

    const users = await User.findAll({ where: { role: 'STUDENT', studentId: { [Op.in]: requestedStudentIds } } });

    const usersByStudentId = new Map(users.map((user) => [user.studentId, user]));
    const missing = requestedStudentIds.filter((studentId) => !usersByStudentId.has(studentId));
    if (missing.length > 0) {
      return res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Some student IDs were not found',
        failures: missing.map((studentId) => ({ studentId, reason: 'Student account not found' })),
      });
    }

    const currentMembers = Array.isArray(group.memberIds) ? group.memberIds.map((id) => String(id)) : [];
    const alreadyMembers = users.filter((user) => currentMembers.includes(String(user.id)));
    if (alreadyMembers.length > 0) {
      return res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Some students are already members of this group',
        failures: alreadyMembers.map((user) => ({ studentId: user.studentId, reason: 'Student is already in the group' })),
      });
    }

    const selfInvite = users.find((user) => String(user.id) === String(req.user.id));
    if (selfInvite) {
      return res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Invalid invitation target list',
        failures: [{ studentId: selfInvite.studentId, reason: 'Group leader cannot invite themselves' }],
      });
    }

    const allGroups = await Group.findAll({ attributes: ['id', 'leaderId', 'memberIds'] });
    const alreadyAssigned = users.filter((user) => allGroups.some((candidate) => {
      if (String(candidate.id) === String(group.id)) return false;
      const leaderMatches = String(candidate.leaderId || '') === String(user.id);
      const memberMatches = Array.isArray(candidate.memberIds) && candidate.memberIds.map((id) => String(id)).includes(String(user.id));
      return leaderMatches || memberMatches;
    }));

    if (alreadyAssigned.length > 0) {
      return res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'Some students already belong to another group',
        failures: alreadyAssigned.map((user) => ({ studentId: user.studentId, reason: 'Student already belongs to another group' })),
      });
    }

    const inviteeIds = users.map((user) => user.id);
    const { created, skipped } = await GroupService.dispatchInvites(groupId, inviteeIds);

    const skippedStudentIds = skipped.map((inviteeId) => users.find((user) => user.id === inviteeId)?.studentId).filter(Boolean);

    const createdPayload = created.map((invitation) => {
      const invitee = users.find((user) => user.id === invitation.inviteeId);
      return {
        id: invitation.id,
        groupId: invitation.groupId,
        studentId: invitee?.studentId || null,
        status: invitation.status,
      };
    });

    return res.status(201).json({ created: createdPayload, skippedStudentIds });
  } catch (error) {
    if (error.code === 'GROUP_NOT_FOUND') return res.status(404).json({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    if (error.code === 'DUPLICATE_INVITE') return res.status(409).json({ code: 'DUPLICATE_INVITE', message: 'One or more students were already invited' });
    console.error('Error in dispatchInvites:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};