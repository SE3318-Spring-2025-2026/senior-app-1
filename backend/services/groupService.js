const sequelize = require('../db');
const Group = require('../models/Group');

class GroupService {
  async createShell(name, leaderId) {
    const transaction = await sequelize.transaction();

    try {
      const group = await Group.create({
        name: name.trim(),
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
        error.errors?.some((entry) => entry.path === 'name')
      ) {
        const duplicateError = new Error('Group with this name already exists');
        duplicateError.code = 'DUPLICATE_GROUP_NAME';
        throw duplicateError;
      }

      throw error;
    }
  }
}

module.exports = new GroupService();
