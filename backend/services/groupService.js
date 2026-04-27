const Group = require('../models/Group');
const {
  Invitation,
  AuditLog,
  AdvisorRequest,
  GroupAdvisorAssignment,
} = require('../models');
const sequelize = require('../db');
const NotificationService = require('./notificationService');
const mentorMatchingService = require('./mentorMatchingService');

function getParticipantSet(group) {
  const participantIds = new Set();

  if (group?.leaderId) {
    participantIds.add(String(group.leaderId));
  }

  (Array.isArray(group?.memberIds) ? group.memberIds : []).forEach((memberId) => {
    participantIds.add(String(memberId));
  });

  return participantIds;
}

class GroupService {

  /**
   * Release advisor from group
   */
  static async releaseAdvisor(groupId, advisorId) {
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }
    if (!group.advisorId) {
      const error = new Error('No advisor assigned');
      error.code = 'NO_ADVISOR_ASSIGNED';
      throw error;
    }
    if (String(group.advisorId) !== String(advisorId)) {
      const error = new Error('Not assigned advisor');
      error.code = 'NOT_ASSIGNED_ADVISOR';
      throw error;
    }

    const result = await mentorMatchingService.removeAdvisorAssignmentFromGroup({
      groupId,
      actorId: Number.parseInt(String(advisorId), 10),
    });
    const updatedGroup = await Group.findByPk(groupId);

    return {
      groupId: result.groupId,
      advisorId: updatedGroup?.advisorId ?? null,
      status: updatedGroup?.status ?? 'LOOKING_FOR_ADVISOR',
    };
  }

  /**
   * Remove advisor assignment as admin/coordinator or current advisor.
   */
  static async removeAdvisorAssignment(groupId, actor) {
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }
    if (!group.advisorId) {
      const error = new Error('No advisor assigned');
      error.code = 'NO_ADVISOR_ASSIGNED';
      throw error;
    }

    const allowedRoles = ['ADMIN', 'COORDINATOR'];
    if (!allowedRoles.includes(actor?.role) && String(group.advisorId) !== String(actor?.id)) {
      const error = new Error('You are not authorized to remove this advisor assignment');
      error.code = 'FORBIDDEN';
      throw error;
    }

    const result = await mentorMatchingService.removeAdvisorAssignmentFromGroup({ groupId });
    const updatedGroup = await Group.findByPk(groupId);

    return {
      groupId: result.groupId,
      advisorId: updatedGroup?.advisorId ?? null,
      status: updatedGroup?.status ?? 'LOOKING_FOR_ADVISOR',
      previousAdvisorId: result.previousAdvisorId,
      removed: result.removed,
    };
  }

  /**
   * Delete orphan group (group without advisor assignment).
   */
  static async deleteOrphanGroup(groupId, actor) {
    const group = await Group.findByPk(groupId);
    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }
    if (group.advisorId) {
      const error = new Error('Group has an assigned advisor');
      error.code = 'GROUP_HAS_ADVISOR';
      throw error;
    }

    try {
      await Invitation.destroy({ where: { groupId: group.id } });
      await AdvisorRequest.destroy({ where: { groupId: group.id } });
      await GroupAdvisorAssignment.destroy({ where: { groupId: group.id } });
      await group.destroy();

      await AuditLog.create({
        action: 'DELETE_ORPHAN_GROUP',
        actorId: actor?.id || null,
        targetType: 'GROUP',
        targetId: group.id,
        metadata: {
          groupId: group.id,
          groupName: group.name,
          reason: 'No advisor assigned',
        },
      });

      return { groupId: group.id, removed: true };
    } catch (err) {
      const error = new Error(err.message || 'Data integrity error during group deletion');
      error.code = 'DATA_INTEGRITY_ERROR';
      throw error;
    }
  }

  static async findAnyGroupForUser(userId, options = {}) {
    const normalizedUserId = String(userId);
    const excludedGroupId = options.excludeGroupId ? String(options.excludeGroupId) : null;

    const groups = await Group.findAll({
      attributes: ['id', 'name', 'leaderId', 'memberIds'],
      transaction: options.transaction,
    });

    return groups.find((group) => {
      if (excludedGroupId && String(group.id) === excludedGroupId) {
        return false;
      }

      const leaderMatches = String(group.leaderId || '') === normalizedUserId;
      const memberMatches = Array.isArray(group.memberIds)
        && group.memberIds.map(String).includes(normalizedUserId);

      return leaderMatches || memberMatches;
    }) || null;
  }

  /**
   * Create a new group
   */
  static async createGroup(groupName, maxMembers, leaderId = null) {
    if (leaderId !== null && leaderId !== undefined) {
      const groups = await Group.findAll({ attributes: ['leaderId', 'memberIds'] });
      const userId = String(leaderId);
      const isMemberInAnotherGroup = groups.some((group) => {
        const isLeader = String(group.leaderId || '') === userId;
        if (isLeader) {
          return false;
        }

        return Array.isArray(group.memberIds)
          && group.memberIds.map(String).includes(userId);
      });

      if (isMemberInAnotherGroup) {
        const error = new Error('Student already belongs to a group');
        error.code = 'ALREADY_IN_GROUP';
        throw error;
      }
    }

    const group = await Group.create({
      name: groupName,
      maxMembers,
      leaderId,
      status: 'FORMATION',
      memberIds: [],
    });

    return group;
  }

  /**
   * Get group membership details
   */
  static async getGroupMembership(groupId) {
    const group = await Group.findByPk(groupId);

    if (!group) {
      const error = new Error('Group not found');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    return group;
  }

  /**
   * Finalize membership - add a student to group with atomic transactions
   * Uses pessimistic locking to prevent race conditions
   * Emits notification to Team Leader after successful update (fire-and-forget)
   */
  static async finalizeMembership(groupId, studentId) {
    const transaction = await sequelize.transaction();

    try {
      const group = await Group.findByPk(groupId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!group) {
        const error = new Error('Group not found');
        error.code = 'GROUP_NOT_FOUND';
        throw error;
      }

      if (group.status === 'FINALIZED' || group.status === 'DISBANDED') {
        const error = new Error('Group has been finalized');
        error.code = 'GROUP_FINALIZED';
        throw error;
      }

      const currentMembers = Array.isArray(group.memberIds) ? group.memberIds.map(String) : [];
      const currentParticipants = getParticipantSet(group);

      const existingGroup = await GroupService.findAnyGroupForUser(studentId, {
        excludeGroupId: group.id,
        transaction,
      });
      if (existingGroup) {
        const error = new Error('Student already belongs to another group');
        error.code = 'ALREADY_IN_OTHER_GROUP';
        throw error;
      }

      if (currentMembers.includes(String(studentId))) {
        const error = new Error('Student is already a member of this group');
        error.code = 'DUPLICATE_MEMBER';
        throw error;
      }

      if (currentParticipants.size >= group.maxMembers) {
        const error = new Error('Group has reached maximum member capacity');
        error.code = 'MAX_MEMBERS_REACHED';
        throw error;
      }

      const updatedMembers = [...currentMembers, String(studentId)];
      const updatedTotalMembers = currentParticipants.size + 1;
      await group.update({ memberIds: updatedMembers }, { transaction });
      await transaction.commit();

      if (group.leaderId) {
        NotificationService.notifyMembershipAccepted({
          groupId: group.id,
          leaderId: group.leaderId,
          studentId,
          totalMembers: updatedTotalMembers,
          maxMembers: group.maxMembers,
        });
      }

      return {
        groupId: group.id,
        studentId,
        totalMembers: updatedTotalMembers,
        maxMembers: group.maxMembers,
        success: true,
      };
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /**
   * Check if a student is a member of a group
   */
  static async isStudentMember(groupId, studentId) {
    const group = await Group.findByPk(groupId);

    if (!group) {
      return false;
    }

    return (group.memberIds || []).includes(studentId);
  }

  // ---------------------------------------------------------------------------
  // P22 — Dispatch Invitations (f5, f6)
  // ---------------------------------------------------------------------------

  /**
   * Persists invitations to D8 then triggers one notification per invitation.
   * Fire-and-forget notifications — never blocks the API response.
   *
   * @param {string}   groupId
   * @param {number[]} inviteeIds
   * @returns {Promise<{ created: object[], skipped: number[] }>}
   */
  static async dispatchInvites(groupId, inviteeIds) {
    const uniqueInviteeIds = [...new Set(inviteeIds)];

    const existing = await Invitation.findAll({
      where: { groupId, inviteeId: uniqueInviteeIds },
      attributes: ['id', 'groupId', 'inviteeId', 'status'],
    });

    const pendingInviteeIds = new Set(
      existing
        .filter((invitation) => invitation.status === 'PENDING')
        .map((invitation) => invitation.inviteeId),
    );
    const recyclableInvitations = existing.filter((invitation) => invitation.status !== 'PENDING');
    const recyclableInviteeIds = new Set(recyclableInvitations.map((invitation) => invitation.inviteeId));

    const toInsert = uniqueInviteeIds.filter((id) => !pendingInviteeIds.has(id) && !recyclableInviteeIds.has(id));
    const skipped = uniqueInviteeIds.filter((id) => pendingInviteeIds.has(id));

    let created = [];
    if (toInsert.length > 0) {
      created = await Invitation.bulkCreate(
        toInsert.map((inviteeId) => ({ groupId, inviteeId, status: 'PENDING' })),
        { returning: true },
      );
    }

    const requeued = await Promise.all(
      recyclableInvitations.map(async (invitation) => {
        await invitation.update({ status: 'PENDING' });
        return invitation;
      }),
    );

    created = [...created, ...requeued];

    for (const invitation of created) {
      NotificationService.queueInviteAlert(
        invitation.inviteeId,
        invitation.groupId,
        invitation.id,
      );
    }

    return { created, skipped };
  }

  // ---------------------------------------------------------------------------
  // P23 — Process Invitee Response (f7, f9, f10, f14)
  // ---------------------------------------------------------------------------

  /**
   * Validates and applies an ACCEPT / REJECT decision to a PENDING invitation.
   *
   * Authorization : only Invitation.inviteeId may respond → 403
   * State guard   : only PENDING may be updated → 400
   * On ACCEPT     : triggers finalizeMembership (f10) fire-and-forget
   * Always        : writes audit log entry (f14) fire-and-forget
   *
   * @param {object} params
   * @param {string} params.invitationId
   * @param {number} params.callerId      - req.user.id from JWT
   * @param {string} params.response      - "ACCEPT" | "REJECT"
   *
   * @returns {Promise<
   *   | { invitation: object }
   *   | { error: 'NOT_FOUND' }
   *   | { error: 'FORBIDDEN' }
   *   | { error: 'ALREADY_RESOLVED' }
   * >}
   */
  static async processResponse({ invitationId, callerId, response }) {
    // f8: fetch invite details from D8
    const invitation = await Invitation.findByPk(invitationId);

    if (!invitation) return { error: 'NOT_FOUND' };

    // Authorization: only the invited student may respond
    if (invitation.inviteeId !== callerId) return { error: 'FORBIDDEN' };

    // State-transition guard: only PENDING → ACCEPTED / REJECTED
    if (invitation.status !== 'PENDING') return { error: 'ALREADY_RESOLVED' };

    if (response === 'ACCEPT') {
      try {
        await GroupService.finalizeMembership(invitation.groupId, callerId);
      } catch (error) {
        if (error.code === 'ALREADY_IN_OTHER_GROUP' || error.code === 'DUPLICATE_MEMBER') {
          return { error: 'ALREADY_IN_GROUP' };
        }
        if (error.code === 'MAX_MEMBERS_REACHED') {
          return { error: 'GROUP_FULL' };
        }
        if (error.code === 'GROUP_FINALIZED') {
          return { error: 'GROUP_CLOSED' };
        }
        throw error;
      }
    }

    // f9: update invitation status in D8
    const newStatus = response === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    await invitation.update({ status: newStatus });

    // f14: audit log — fire-and-forget, never rolls back D8
    GroupService._writeAuditLog({
      invitationId: invitation.id,
      groupId: invitation.groupId,
      actorId: callerId,
      action: response === 'ACCEPT' ? 'INVITATION_ACCEPTED' : 'INVITATION_REJECTED',
    });

    return {
      invitation: {
        id: invitation.id,
        groupId: invitation.groupId,
        inviteeId: invitation.inviteeId,
        status: invitation.status,
        updatedAt: invitation.updatedAt,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  static async _writeAuditLog({ invitationId, groupId, actorId, action }) {
    try {
      await AuditLog.create({
        targetType: 'INVITATION',
        targetId: invitationId,
        actorId,
        action,
        metadata: { groupId },
      });
    } catch (err) {
      console.error('[GroupService] _writeAuditLog failed', { invitationId, action }, err);
    }
  }
}

module.exports = GroupService;
