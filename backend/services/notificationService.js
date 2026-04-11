const { User } = require('../models');

/**
 * NotificationService - Handles asyncronous notification delivery
 * Features:
 * - Fire-and-forget pattern (doesn't block main flow)
 * - Retry logic for transient failures
 * - Logs failures without rolling back database updates
 */
class NotificationService {
  static MAX_RETRIES = 3;
  static RETRY_DELAY_MS = 1000;

  /**
   * Emit a notification event to the Team Leader
   * Async operation that doesn't block main flow
   * 
   * @param {object} options - Notification options
   * @param {number} options.groupId - Group ID
   * @param {string} options.leaderId - Team Leader user ID  
   * @param {string} options.type - Notification type (e.g., 'MEMBERSHIP_ACCEPTED', 'MEMBERSHIP_REJECTED')
   * @param {object} options.payload - Notification payload { groupId, memberChange, summary }
   * @returns {void} - Fire-and-forget, returns immediately
   */
  static emitNotification({ groupId, leaderId, type, payload }) {
    // Fire-and-forget: emit and let it run asynchronously
    this._notifyLeader(groupId, leaderId, type, payload, 0).catch((err) => {
      console.error(`[NotificationService] Failed to emit notification after retries:`, {
        groupId,
        leaderId,
        type,
        error: err.message,
      });
      // Don't throw - this is fire-and-forget, so failures don't affect main flow
    });
  }

  /**
   * Internal notification delivery with retry logic
   * @private
   */
  static async _notifyLeader(groupId, leaderId, type, payload, retryCount = 0) {
    try {
      // Fetch the leader to verify they exist
      const leader = await User.findByPk(leaderId);
      if (!leader) {
        throw new Error(`Team Leader not found: ${leaderId}`);
      }

      // TODO: In production, this would integrate with actual notification system
      // For now, we log the notification event for auditing
      console.log('[NotificationService] Event emitted:', {
        timestamp: new Date().toISOString(),
        groupId,
        recipientId: leaderId,
        recipientName: leader.fullName,
        type,
        payload,
      });

      // Record notification in audit/event log
      // In a real system, this would store in D9 (Notification store)
      await this._logNotificationEvent({
        groupId,
        leaderId,
        type,
        payload,
      });

      return {
        success: true,
        message: `Notification delivered to ${leader.fullName}`,
      };
    } catch (error) {
      // Retry logic for transient failures
      if (retryCount < this.MAX_RETRIES) {
        const delayMs = this.RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
        console.warn(`[NotificationService] Retry ${retryCount + 1}/${this.MAX_RETRIES} (delay: ${delayMs}ms):`, {
          groupId,
          leaderId,
          type,
          error: error.message,
        });

        // Wait then retry
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this._notifyLeader(groupId, leaderId, type, payload, retryCount + 1);
      }

      // Max retries exceeded
      throw error;
    }
  }

  /**
   * Log notification event for audit trail
   * In production, this would write to D9 (Notification store)
   * @private
   */
  static async _logNotificationEvent({ groupId, leaderId, type, payload }) {
    // TODO: Implement persistent storage of notifications
    // For now, this is just console logging for development
    console.log('[NotificationService] Event logged:', {
      groupId,
      leaderId,
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit membership accepted notification
   * Called when a student successfully joins a group
   */
  static notifyMembershipAccepted({ groupId, leaderId, studentId, totalMembers, maxMembers }) {
    this.emitNotification({
      groupId,
      leaderId,
      type: 'MEMBERSHIP_ACCEPTED',
      payload: {
        groupId,
        studentId,
        memberChange: 'ADDED',
        currentMembers: totalMembers,
        maxMembers,
        summary: `Student ${studentId} has joined the group (${totalMembers}/${maxMembers})`,
      },
    });
  }

  /**
   * Emit membership rejected notification
   * Called when membership finalization fails due to constraints
   */
  static notifyMembershipRejected({ groupId, leaderId, studentId, reason }) {
    this.emitNotification({
      groupId,
      leaderId,
      type: 'MEMBERSHIP_REJECTED',
      payload: {
        groupId,
        studentId,
        memberChange: 'REJECTED',
        reason,
        summary: `Student ${studentId} could not join the group: ${reason}`,
      },
    });
  }
}

module.exports = NotificationService;
