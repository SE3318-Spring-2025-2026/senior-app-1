/**
 * NotificationService
 *
 * Responsible for queuing and dispatching in-app notifications.
 * All public methods are fire-and-forget (non-blocking): callers await nothing
 * and the API response is never held up by notification delivery.
 *
 * Failure contract (per acceptance criteria):
 *  - Notification failures are logged and flagged for retry.
 *  - D8 (invitation) writes are NEVER rolled back on notification failure.
 */

const { Notification } = require('../models');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Persists a notification row to D9 (notifications table).
 * Returns the created record or null on failure.
 *
 * @param {object} payload
 * @param {number} payload.targetId      - Recipient user ID
 * @param {string} payload.type          - Notification type key
 * @param {object} payload.data          - Arbitrary JSON stored with the record
 * @returns {Promise<object|null>}
 */
async function persistNotification({ targetId, type, data }) {
  try {
    const notification = await Notification.create({
      userId: targetId,
      type,
      payload: JSON.stringify(data),
      status: 'PENDING',
      retryCount: 0,
    });
    return notification;
  } catch (err) {
    console.error(
      '[NotificationService] persistNotification failed',
      { targetId, type, data },
      err,
    );
    return null;
  }
}

/**
 * Marks a notification as SENT.
 *
 * @param {number} notificationId
 */
async function markSent(notificationId) {
  try {
    await Notification.update(
      { status: 'SENT', sentAt: new Date() },
      { where: { id: notificationId } },
    );
  } catch (err) {
    console.error(
      '[NotificationService] markSent failed',
      { notificationId },
      err,
    );
  }
}

/**
 * Flags a notification as FAILED and increments the retry counter.
 * This record can be picked up by a future retry job.
 * D8 (invitation) data is untouched.
 *
 * @param {number} notificationId
 * @param {Error}  err
 */
async function flagForRetry(notificationId, err) {
  console.error(
    '[NotificationService] Notification delivery failed – flagging for retry.',
    { notificationId, error: err.message },
  );

  try {
    await Notification.increment('retryCount', { where: { id: notificationId } });
    await Notification.update(
      { status: 'FAILED', lastError: err.message },
      { where: { id: notificationId } },
    );
  } catch (updateErr) {
    // Logging is the last line of defence; never throw from here.
    console.error(
      '[NotificationService] Could not flag notification for retry.',
      { notificationId },
      updateErr,
    );
  }
}

// ---------------------------------------------------------------------------
// Dispatch strategy (pluggable)
// ---------------------------------------------------------------------------

/**
 * Resolves the active WebSocket server instance attached to the Express app.
 * Returns null when the global reference is not yet set (e.g. during tests).
 */
function getIo() {
  // The Socket.IO instance is stored on global.io by server.js after the HTTP
  // server is created.  This avoids circular-require problems.
  return global.io || null;
}

/**
 * Attempts to push the notification to the recipient over WebSocket.
 * Gracefully no-ops when Socket.IO is unavailable (REST-only environments,
 * unit tests, etc.).
 *
 * @param {number} targetId
 * @param {object} notificationRecord  - Sequelize Notification instance
 */
function pushToClient(targetId, notificationRecord) {
  const io = getIo();
  if (!io) return;

  try {
    // Each authenticated socket joins a room named after the user's ID.
    io.to(`user:${targetId}`).emit('notification:new', {
      id: notificationRecord.id,
      type: notificationRecord.type,
      payload: JSON.parse(notificationRecord.payload),
      createdAt: notificationRecord.createdAt,
    });
  } catch (err) {
    // WebSocket emission is best-effort; persistence already happened.
    console.warn('[NotificationService] WebSocket push failed.', { targetId }, err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * queueInviteAlert
 *
 * Creates exactly one notification for the invited student and pushes it over
 * WebSocket if a live connection exists.  The function is intentionally
 * fire-and-forget: it must be called without `await` (or with void) so the
 * API response is never blocked.
 *
 * Failure contract:
 *  - If DB persistence fails  → error is logged; no record is created.
 *  - If WebSocket push fails  → notification is already persisted; the client
 *    will fetch it on next poll.  Record stays PENDING for the retry job.
 *  - D8 writes are NEVER affected.
 *
 * @param {number} targetId      - ID of the student being invited (recipient)
 * @param {number} groupId       - ID of the group the invitation belongs to
 * @param {number} invitationId  - ID of the invitation record in D8
 * @returns {void}               - Intentionally not awaited by callers
 *
 * @example
 * // In GroupService.dispatchInvites – after D8 persistence succeeds:
 * for (const invitation of savedInvitations) {
 *   notificationService.queueInviteAlert(
 *     invitation.inviteeId,
 *     invitation.groupId,
 *     invitation.id,
 *   ); // no await – fire and forget
 * }
 */
async function queueInviteAlert(targetId, groupId, invitationId) {
  const type = 'GROUP_INVITE';
  const data = { invitationId, groupId };

  // Step 1 – persist to D9 (notifications table)
  const record = await persistNotification({ targetId, type, data });

  if (!record) {
    // persistNotification already logged the error.
    // Nothing more we can do; D8 is untouched.
    return;
  }

  // Step 2 – attempt real-time WebSocket push
  try {
    pushToClient(targetId, record);
    await markSent(record.id);
  } catch (err) {
    await flagForRetry(record.id, err);
  }
}

module.exports = { queueInviteAlert };
