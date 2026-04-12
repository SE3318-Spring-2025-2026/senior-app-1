const Group = require('../models/Group');
const sequelize = require('../db');
const NotificationService = require('./notificationService');

class GroupService {
  /**
   * Create a new group
   */
  static async createGroup(groupName, maxMembers, leaderId = null) {
    const group = await Group.create({
      name: groupName,
      maxMembers,
      leaderId: leaderId != null ? String(leaderId) : null,
      memberIds: [],
      status: 'FORMATION',
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

      const currentMembers = group.memberIds || [];

      if (currentMembers.includes(studentId)) {
        const error = new Error('Student is already a member of this group');
        error.code = 'DUPLICATE_MEMBER';
        throw error;
      }

      const max = group.maxMembers ?? 10;
      if (currentMembers.length >= max) {
        const error = new Error('Group has reached maximum member capacity');
        error.code = 'MAX_MEMBERS_REACHED';
        throw error;
      }

      const updatedMembers = [...currentMembers, studentId];
      await group.update({ memberIds: updatedMembers }, { transaction });

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

    return (group.memberIds || []).includes(studentId);
  }
}

module.exports = GroupService;
