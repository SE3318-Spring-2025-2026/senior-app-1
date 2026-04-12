const Group = require('../models/Group');
const { Invitation, AuditLog } = require('../models');
const sequelize = require('../db');
const NotificationService = require('./notificationService');

class GroupService {
  /**
   * Create a new group
   */
  static async createGroup(groupName, maxMembers, leaderId = null) {
    const group = await Group.create({
      groupName,
      maxMembers,
      leaderId,
      status: 'FORMATION',
      members: [],
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

      const currentMembers = group.members || [];

      if (currentMembers.includes(studentId)) {
        const error = new Error('Student is already a member of this group');
        error.code = 'DUPLICATE_MEMBER';
        throw error;
      }

      if (currentMembers.length >= group.maxMembers) {
        const error = new Error('Group has reached maximum member capacity');
        error.code = 'MAX_MEMBERS_REACHED';
        throw error;
      }

      const updatedMembers = [...currentMembers, studentId];
      await group.update({ members: updatedMembers }, { transaction });
      await transaction.commit();

      if (group.leaderId) {
        NotificationService.notifyMembershipAccepted({
          groupId: group.id,
          leaderId: group.leaderId,
          studentId,
          totalMembers: updatedMembers.length,
          maxMembers: group.maxMembers,
        });
      }

      return {
        groupId: group.id,
        studentId,
        totalMembers: updatedMembers.length,
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

    return (group.members || []).includes(studentId);
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
      attributes: ['inviteeId'],
    });

    const alreadyInvited = new Set(existing.map((inv) => inv.inviteeId));
    const toInsert = uniqueInviteeIds.filter((id) => !alreadyInvited.has(id));
    const skipped = uniqueInviteeIds.filter((id) => alreadyInvited.has(id));

    let created = [];
    if (toInsert.length > 0) {
      created = await Invitation.bulkCreate(
        toInsert.map((inviteeId) => ({ groupId, inviteeId, status: 'PENDING' })),
        { returning: true },
      );
    }

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

    // f10: membership finalization on ACCEPT — fire-and-forget
    if (response === 'ACCEPT') {
      GroupService.finalizeMembership(invitation.groupId, callerId).catch((err) => {
        console.error('[GroupService] finalizeMembership failed after ACCEPT', err);
      });
    }

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
        entityType: 'INVITATION',
        entityId: invitationId,
        actorId,
        action,
        metadata: JSON.stringify({ groupId }),
      });
    } catch (err) {
      console.error('[GroupService] _writeAuditLog failed', { invitationId, action }, err);
    }
  }
}

module.exports = GroupService;