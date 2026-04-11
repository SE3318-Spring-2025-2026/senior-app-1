const AuditLog = require('../models/AuditLog');

/**
 * AuditLogRepository
 *
 * Sole write path for D6 (Audit Logs).
 * Always called with the caller's transaction so the audit row is
 * committed atomically with the business write it describes — if the
 * business write rolls back, the audit row rolls back too.
 */
class AuditLogRepository {
  /**
   * Persist one audit record.
   *
   * @param {object} params
   * @param {string}  params.action      - Action vocabulary string (e.g. 'GROUP_CREATED')
   * @param {number}  params.actorId     - User PK of the actor
   * @param {string}  params.targetId    - PK of the affected entity
   * @param {string}  params.targetType  - Entity type label (e.g. 'GROUP')
   * @param {object}  params.metadata    - Action-specific context (e.g. { groupName })
   * @param {object}  transaction        - Active Sequelize transaction
   * @returns {Promise<AuditLog>}
   */
  async create({ action, actorId, targetId, targetType, metadata }, transaction) {
    return AuditLog.create(
      { action, actorId, targetId, targetType, metadata },
      { transaction }
    );
  }
}

module.exports = new AuditLogRepository();
