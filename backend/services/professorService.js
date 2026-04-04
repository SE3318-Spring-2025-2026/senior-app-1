const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const sequelize = require('../db');
const User = require('../models/User');
const Professor = require('../models/Professor');

class ProfessorService {

  generateSecureToken() {
    return `pst_${crypto.randomBytes(32).toString('hex')}`;
  }

  hashToken(token) {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  isValidPassword(password) {
    if (typeof password !== 'string') {
      return false;
    }

    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);
  }

  async registerProfessor(email, fullName, department) {
    const transaction = await sequelize.transaction();

    try {
      // 1. Check existing user
      const existingUser = await User.findOne({
        where: { email },
        transaction
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // 2. Generate token
      const rawSetupToken = this.generateSecureToken();

      // 3. Hash token
      const passwordSetupTokenHash = this.hashToken(rawSetupToken);

      // 4. Expiration (24 saat)
      const passwordSetupTokenExpiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      );

      // 5. Create User
      const user = await User.create({
        email,
        fullName,
        role: 'PROFESSOR',
        status: 'PASSWORD_SETUP_REQUIRED',
        passwordSetupTokenHash,
        passwordSetupTokenExpiresAt,
      }, { transaction });

      // 6. Create Professor
      const professor = await Professor.create({
        userId: user.id,
        department,
      }, { transaction });

      // 7. Commit
      await transaction.commit();

      // ISSUE'NUN İSTEDİĞİ RESPONSE
      return {
        userId: user.id,
        professorId: professor.id,
        setupRequired: true,
        setupTokenGenerated: true,
        message: 'Password setup link has been generated'
      };

    } catch (error) {
      await transaction.rollback();

      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some((e) => e.path === 'email')
      ) {
        throw new Error('User with this email already exists');
      }

      throw error;
    }
  }

  async setInitialPassword(setupToken, newPassword) {
    if (!setupToken || typeof setupToken !== 'string') {
      throw new Error('INVALID_SETUP_TOKEN');
    }

    if (!this.isValidPassword(newPassword)) {
      throw new Error('INVALID_PASSWORD_POLICY');
    }

    const passwordSetupTokenHash = this.hashToken(setupToken);

    const user = await User.findOne({
      where: {
        role: 'PROFESSOR',
        status: 'PASSWORD_SETUP_REQUIRED',
        passwordSetupTokenHash,
        passwordSetupTokenExpiresAt: {
          [Op.gt]: new Date(),
        },
      },
    });

    if (!user) {
      throw new Error('INVALID_SETUP_TOKEN');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await user.update({
      password: hashedPassword,
      status: 'ACTIVE',
      passwordSetupTokenHash: null,
      passwordSetupTokenExpiresAt: null,
    });

    return {
      message: 'Password set successfully',
    };
  }
}

module.exports = new ProfessorService();
