const sequelize = require('../db');
const Group = require('../models/Group');
const User = require('../models/User');

const CODES = {
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  INVALID_ACTION: 'INVALID_ACTION',
  LEADER_REMOVAL_REQUIRES_REASSIGNMENT: 'LEADER_REMOVAL_REQUIRES_REASSIGNMENT',
};

function repositoryError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function serializeGroup(group) {
  return {
    id: group.id,
    name: group.name,
    leaderId: group.leaderId,
    memberIds: group.memberIds,
    advisorId: group.advisorId,
  };
}

/**
 * Persists coordinator ADD/REMOVE to D2 inside a transaction with a row lock on the group,
 * so concurrent P24 finalize (using {@link runWithGroupRowLocked}) serializes on the same row.
 *
 * @param {string} groupId
 * @param {'ADD'|'REMOVE'} action
 * @param {string} studentId 11-digit student id
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function applyCoordinatorChange(groupId, action, studentId, options = {}) {
  const gid = String(groupId).trim();
  const sid = String(studentId).trim();

  if (action !== 'ADD' && action !== 'REMOVE') {
    throw repositoryError(CODES.INVALID_ACTION, 'Invalid action');
  }

  const run = async (transaction) => {
    const group = await Group.findByPk(gid, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!group) {
      throw repositoryError(CODES.GROUP_NOT_FOUND, 'Group not found');
    }

    const student = await User.findOne({
      where: { studentId: sid, role: 'STUDENT' },
      transaction,
    });
    if (!student) {
      throw repositoryError(CODES.STUDENT_NOT_FOUND, 'Student not found');
    }

    let memberIds = Array.isArray(group.memberIds) ? [...group.memberIds] : [];

    if (action === 'ADD') {
      if (!memberIds.includes(sid)) {
        memberIds.push(sid);
      }
      if (!group.leaderId) {
        group.leaderId = sid;
      }
      group.memberIds = memberIds;
      await group.save({ transaction });
      return serializeGroup(group);
    }

    if (group.leaderId === sid) {
      throw repositoryError(
        CODES.LEADER_REMOVAL_REQUIRES_REASSIGNMENT,
        'Cannot remove the group leader without reassigning leadership to another member.',
      );
    }

    memberIds = memberIds.filter((id) => id !== sid);
    group.memberIds = memberIds;
    await group.save({ transaction });
    return serializeGroup(group);
  };

  if (options.transaction) {
    return run(options.transaction);
  }

  return sequelize.transaction(run);
}

/**
 * Locks the D2 group row (UPDATE) inside a transaction. Use for P24 finalize and any write
 * that must not race with {@link applyCoordinatorChange} (same lock → no lost updates).
 *
 * @template T
 * @param {string} groupId
 * @param {(group: import('sequelize').Model, transaction: import('sequelize').Transaction) => Promise<T>} fn
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function runWithGroupRowLocked(groupId, fn, options = {}) {
  const gid = String(groupId).trim();

  const run = async (transaction) => {
    const group = await Group.findByPk(gid, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!group) {
      throw repositoryError(CODES.GROUP_NOT_FOUND, 'Group not found');
    }
    return fn(group, transaction);
  };

  if (options.transaction) {
    return run(options.transaction);
  }

  return sequelize.transaction(run);
}

module.exports = {
  applyCoordinatorChange,
  runWithGroupRowLocked,
  CODES,
};
