const Invitation = require('../models/Invitation');

/**
 * InvitationsRepository
 *
 * Owns all D8 (Pending Invitations) write/read operations.
 *
 * Duplicate strategy: DB unique constraint on (groupId, inviteeId).
 * bulkCreate catches SequelizeUniqueConstraintError and re-throws a
 * domain error with code DUPLICATE_INVITATION so the service/controller
 * can return a deterministic 400 without relying on pre-checks that
 * are vulnerable to TOCTOU races.
 */
class InvitationsRepository {
  /**
   * Persist one PENDING Invitation row per inviteeId.
   * Must be called inside an existing transaction so the caller controls
   * atomicity together with any sibling writes.
   *
   * @param {string}   groupId     - UUID of the target group (D2 key)
   * @param {number[]} inviteeIds  - Array of User PKs (integers) to invite
   * @param {object}   transaction - Active Sequelize transaction
   * @returns {Promise<Invitation[]>} Created records with stable UUIDs
   */
  async bulkCreate(groupId, inviteeIds, transaction) {
    try {
      const invitations = await Promise.all(
        inviteeIds.map((inviteeId) =>
          Invitation.create(
            { groupId, inviteeId, status: 'PENDING' },
            { transaction }
          )
        )
      );
      return invitations;
    } catch (error) {
      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some((e) => e.path === 'invitations_groupId_inviteeId_unique')
      ) {
        const duplicateError = new Error(
          'One or more students already have a pending invitation for this group'
        );
        duplicateError.code = 'DUPLICATE_INVITATION';
        throw duplicateError;
      }
      throw error;
    }
  }
}

module.exports = new InvitationsRepository();
