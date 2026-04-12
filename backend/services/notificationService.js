const { Notification } = require('../models');

/**
 * Persists notification rows (D9) and optionally emits socket events.
 * Failures are intentionally non-fatal to keep upstream flows resilient.
 */
class NotificationService {
  static async queueInviteAlert(targetUserId, groupId, invitationId) {
    let notification;

    try {
      notification = await Notification.create({
        userId: targetUserId,
        type: 'GROUP_INVITE',
        payload: JSON.stringify({ invitationId, groupId }),
        status: 'PENDING',
      });
    } catch (error) {
      console.error('[NotificationService] Failed to persist invite alert', error);
      return;
    }

    try {
      if (global.io && typeof global.io.to === 'function') {
        const payload = { invitationId, groupId };
        global.io.to(`user:${targetUserId}`).emit('notification:new', {
          id: notification.id,
          userId: targetUserId,
          type: 'GROUP_INVITE',
          payload,
          status: 'SENT',
        });
      }

      await notification.update({
        status: 'SENT',
        sentAt: new Date(),
      });
    } catch (error) {
      await notification.update({
        status: 'FAILED',
        retryCount: (notification.retryCount || 0) + 1,
        lastError: String(error.message || error),
      });
    }
  }

  static notifyMembershipAccepted({ groupId, leaderId, studentId, totalMembers, maxMembers }) {
    const event = {
      timestamp: new Date().toISOString(),
      groupId,
      recipientId: String(leaderId),
      type: 'MEMBERSHIP_ACCEPTED',
      payload: {
        groupId,
        studentId,
        memberChange: 'ADDED',
        currentMembers: totalMembers,
        maxMembers,
        summary: `Student ${studentId} has joined the group (${totalMembers}/${maxMembers})`,
      },
    };

    console.log('[NotificationService] Event emitted:', event);

    if (global.io && typeof global.io.to === 'function') {
      global.io.to(`user:${leaderId}`).emit('notification:new', event);
    }

    console.log('[NotificationService] Event logged:', {
      groupId,
      leaderId,
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp,
    });
  }
}

module.exports = NotificationService;
