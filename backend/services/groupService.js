const Group = require('../models/Group');
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
      // Pessimistic locking: lock the group row for update
      const group = await Group.findByPk(groupId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      // Check if group exists
      if (!group) {
        const error = new Error('Group not found');
        error.code = 'GROUP_NOT_FOUND';
        throw error;
      }

      // Check if group is already finalized
      if (group.status === 'FINALIZED' || group.status === 'DISBANDED') {
        const error = new Error('Group has been finalized');
        error.code = 'GROUP_FINALIZED';
        throw error;
      }

      // Ensure members is an array
      const currentMembers = group.members || [];

      // Check if student is already a member
      if (currentMembers.includes(studentId)) {
        const error = new Error('Student is already a member of this group');
        error.code = 'DUPLICATE_MEMBER';
        throw error;
      }

      // Check if group has reached max members
      if (currentMembers.length >= group.maxMembers) {
        const error = new Error('Group has reached maximum member capacity');
        error.code = 'MAX_MEMBERS_REACHED';
        throw error;
      }

      // Add member atomically
      const updatedMembers = [...currentMembers, studentId];
      await group.update(
        { members: updatedMembers },
        { transaction }
      );

      // Commit transaction
      await transaction.commit();

      // Emit notification AFTER successful transaction commit
      // Fire-and-forget: failures here do not affect the main operation
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
      // Only rollback if transaction is still active
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
}

module.exports = GroupService;
