  /**
   * Notify group members and leader that advisor has released the group
   * @param {object} param0
   * @param {string|number} param0.userId
   * @param {string} param0.groupId
   * @param {string} param0.groupName
   */
  static async notifyAdvisorReleased({ userId, groupId, groupName }) {
    let row;
    try {
      row = await Notification.create({
        userId,
        type: 'ADVISOR_RELEASED',
        payload: JSON.stringify({ groupId, groupName }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist advisor release notification', error);
      return;
    }
    await NotificationService.#pushAndMark(row, `user:${userId}`, { groupId, groupName });
  }
const { Notification } = require('../models');

class NotificationService {
  static async queueInviteAlert(targetId, groupId, invitationId) {
    let row;

    try {
      row = await Notification.create({
        userId: targetId,
        type: 'GROUP_INVITE',
        payload: JSON.stringify({ invitationId, groupId }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist invite notification', error);
      return;
    }

    await NotificationService.#pushAndMark(row, `user:${targetId}`, {
      invitationId,
      groupId,
    });
  }

  static async notifyMembershipAccepted({ groupId, leaderId, studentId, totalMembers, maxMembers }) {
    let row;

    try {
      row = await Notification.create({
        userId: leaderId,
        type: 'GROUP_MEMBERSHIP_ACCEPTED',
        payload: JSON.stringify({ groupId, studentId, totalMembers, maxMembers }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist membership notification', error);
      return;
    }

    await NotificationService.#pushAndMark(row, `user:${leaderId}`, {
      groupId,
      studentId,
      totalMembers,
      maxMembers,
    });
  }

  static async #pushAndMark(row, room, payload) {
    try {
      if (global.io && typeof global.io.to === 'function') {
        global.io.to(room).emit('notification:new', {
          id: row.id,
          type: row.type,
          payload,
          status: 'SENT',
          createdAt: row.createdAt,
        });
      }

      console.log('[NotificationService] Event emitted', row.type, room);

      await row.update({
        status: 'SENT',
        sentAt: new Date(),
      });
    } catch (error) {
      await row.update({
        status: 'FAILED',
        retryCount: (row.retryCount || 0) + 1,
        lastError: String(error?.message || error),
      });
    }
  }
}

module.exports = NotificationService;
