const sequelize = require('../db');
const Group = require('../models/Group');

class GroupService {
  async createShell(name, leaderId) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      const err = new Error('Group name must be a non-empty string');
      err.code = 'INVALID_GROUP_NAME';
      throw err;
    }

    const trimmedName = name.trim();
    const normalizedName = trimmedName.toLowerCase();

    const transaction = await sequelize.transaction();

    try {
      const group = await Group.create({
        name: trimmedName,
        normalizedName,
        leaderId,
        memberIds: [leaderId],
        advisorId: null,
      }, { transaction });

      await transaction.commit();

      return {
        id: group.id,
        name: group.name,
        leaderId: group.leaderId,
        memberIds: group.memberIds,
        advisorId: group.advisorId,
      };
    } catch (error) {
      await transaction.rollback();

      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some((entry) =>
          entry.path === 'name' || entry.path === 'normalizedName'
        )
      ) {
        const duplicateError = new Error('Group with this name already exists');
        duplicateError.code = 'DUPLICATE_GROUP_NAME';
        throw duplicateError;
      }

      if (error.name === 'SequelizeForeignKeyConstraintError') {
        const fkError = new Error('Leader not found');
        fkError.code = 'LEADER_NOT_FOUND';
        throw fkError;
      }

      throw error;
    }
  }
}

module.exports = new GroupService();
