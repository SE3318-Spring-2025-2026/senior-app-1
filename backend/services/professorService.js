const crypto = require('crypto');
const sequelize = require('../db');
const User = require('../models/User');
const Professor = require('../models/Professor');

class ProfessorService {
  async registerProfessor(email, fullName, department) {
    const transaction = await sequelize.transaction();

    try {
      const existingUser = await User.findOne({ where: { email }, transaction });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const rawSetupToken = crypto.randomBytes(32).toString('hex');
      const passwordSetupTokenHash = crypto
        .createHash('sha256')
        .update(rawSetupToken)
        .digest('hex');

      const passwordSetupTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const user = await User.create({
        email,
        fullName,
        role: 'PROFESSOR',
        status: 'PASSWORD_SETUP_REQUIRED',
        passwordSetupTokenHash,
        passwordSetupTokenExpiresAt,
      }, { transaction });

      const professor = await Professor.create({
        userId: user.id,
        department,
      }, { transaction });

      await transaction.commit();

      return {
        userId: user.id,
        professorId: professor.id,
      };
    } catch (error) {
      await transaction.rollback();

      if (error.name === 'SequelizeUniqueConstraintError' && error.errors.some(e => e.path === 'email')) {
        const duplicateError = new Error('User with this email already exists');
        duplicateError.code = 11000;
        duplicateError.keyPattern = { email: 1 };
        throw duplicateError;
      }

      throw error;
    }
  }
}

module.exports = new ProfessorService();