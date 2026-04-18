const { Notification } = require('../models');

class NotificationService {
  static async notifyTeamLeaderAdvisorDecision({
    leaderId,
    requestId,
    groupId,
    groupName,
    advisorDecision,
    advisorId = null,
    advisorName = null,
    advisorEmail = null,
    message,
  }) {
    const normalizedDecision = String(advisorDecision || '').toUpperCase();
    const fallbackMessage = normalizedDecision === 'APPROVED'
      ? 'Your advisor request has been approved.'
      : 'Your advisor request has been rejected.';
    let row;

    try {
      row = await Notification.create({
        userId: leaderId,
        type: 'ADVISOR_DECISION',
        payload: JSON.stringify({
          requestId,
          groupId,
          groupName,
          advisorDecision: normalizedDecision || null,
          advisorId,
          advisorName,
          advisorEmail,
          message: message || fallbackMessage,
        }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist team leader advisor decision notification', error);
      return;
    }

    await NotificationService.#pushAndMark(row, `user:${leaderId}`, {
      requestId,
      groupId,
      groupName,
      advisorDecision: normalizedDecision || null,
      advisorId,
      advisorName,
      advisorEmail,
      message: message || fallbackMessage,
    });
  }

  static async notifyAdvisorTransferredGroup({
    advisorId,
    groupId,
    groupName,
    message = 'A new group has been assigned to you through transfer.',
  }) {
    let row;

    try {
      row = await Notification.create({
        userId: advisorId,
        type: 'GROUP_TRANSFER',
        payload: JSON.stringify({
          groupId,
          groupName,
          message,
        }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist advisor transfer notification', error);
      return;
    }

    await NotificationService.#pushAndMark(row, `user:${advisorId}`, {
      groupId,
      groupName,
      message,
    });
  }

  static async notifyTeamLeaderAdvisorTransferred({
    leaderId,
    groupId,
    groupName,
    newAdvisorId,
    newAdvisorName,
    newAdvisorEmail,
    newAdvisorDepartment = null,
    message = 'Your group advisor has been changed through a transfer.',
  }) {
    let row;

    try {
      row = await Notification.create({
        userId: leaderId,
        type: 'ADVISOR_TRANSFER',
        payload: JSON.stringify({
          groupId,
          groupName,
          newAdvisorId,
          newAdvisorName,
          newAdvisorEmail,
          newAdvisorDepartment,
          message,
        }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist team leader transfer notification', error);
      return;
    }

    await NotificationService.#pushAndMark(row, `user:${leaderId}`, {
      groupId,
      groupName,
      newAdvisorId,
      newAdvisorName,
      newAdvisorEmail,
      newAdvisorDepartment,
      message,
    });
  }

  static async notifyTeamLeaderAdvisorReleased({
    leaderId,
    groupId,
    groupName,
    previousAdvisorId,
    previousAdvisorName,
    previousAdvisorEmail,
    message = 'Your group advisor has been released from the group.',
  }) {
    let row;

    try {
      row = await Notification.create({
        userId: leaderId,
        type: 'ADVISOR_RELEASE',
        payload: JSON.stringify({
          groupId,
          groupName,
          previousAdvisorId,
          previousAdvisorName,
          previousAdvisorEmail,
          message,
        }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist team leader advisor release notification', error);
      return;
    }

    await NotificationService.#pushAndMark(row, `user:${leaderId}`, {
      groupId,
      groupName,
      previousAdvisorId,
      previousAdvisorName,
      previousAdvisorEmail,
      message,
    });
  }

  static async notifyAdvisorReleased({
    userId,
    groupId,
    groupName,
    message = 'Your advisor assignment has been released.',
  }) {
    let row;

    try {
      row = await Notification.create({
        userId,
        type: 'ADVISOR_RELEASE',
        payload: JSON.stringify({
          groupId,
          groupName,
          message,
        }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist advisor release notification', error);
      return;
    }

    await NotificationService.#pushAndMark(row, `user:${userId}`, {
      groupId,
      groupName,
      message,
    });
  }

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
