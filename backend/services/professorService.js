const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const sequelize = require('../db');
const User = require('../models/User');
const Professor = require('../models/Professor');

class ProfessorService {
  normalizeEmail(email) {
    return email.trim().toLowerCase();
  }

  async createProfessorUserAndRecord(email, fullName, department, options = {}) {
    const transaction = await sequelize.transaction();

    try {
      const normalizedEmail = this.normalizeEmail(email);
      const existingUser = await User.findOne({
        where: { email: normalizedEmail },
        transaction,
      });

      if (existingUser) {
        const duplicateError = new Error('User with this email already exists');
        duplicateError.code = 'DUPLICATE_EMAIL';
        throw duplicateError;
      }

      const userPayload = {
        email: normalizedEmail,
        fullName: fullName.trim(),
        role: 'PROFESSOR',
        status: 'PASSWORD_SETUP_REQUIRED',
      };

      if (options.passwordSetupTokenHash) {
        userPayload.passwordSetupTokenHash = options.passwordSetupTokenHash;
      }

      if (options.passwordSetupTokenExpiresAt) {
        userPayload.passwordSetupTokenExpiresAt = options.passwordSetupTokenExpiresAt;
      }

      const user = await User.create({
        ...userPayload,
      }, { transaction });

      const professor = await Professor.create({
        userId: user.id,
        department: department.trim(),
        fullName: fullName.trim(),
      }, { transaction });

      await transaction.commit();

      return { user, professor };
    } catch (error) {
      await transaction.rollback();

      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.errors?.some((entry) => entry.path === 'email')
      ) {
        const duplicateError = new Error('User with this email already exists');
        duplicateError.code = 'DUPLICATE_EMAIL';
        throw duplicateError;
      }

      throw error;
    }
  }

  async createProfessorRecord(email, fullName, department) {
    const { user, professor } = await this.createProfessorUserAndRecord(
      email,
      fullName,
      department,
    );

    return {
      userId: user.id,
      professorId: professor.id,
      setupRequired: true,
    };
  }

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

    const passwordPolicy =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

    return passwordPolicy.test(password);
  }

  async updateProfessorPassword(professorId, passwordHash) {
    const professor = await Professor.findByPk(professorId, {
      include: [{ model: User }],
    });

    if (!professor || !professor.User) {
      throw new Error('PROFESSOR_NOT_FOUND');
    }

    const normalizedPasswordHash = passwordHash.trim();

    await professor.User.update({
      password: normalizedPasswordHash,
      passwordHash: normalizedPasswordHash,
      status: 'ACTIVE',
      passwordSetupTokenHash: null,
      passwordSetupTokenExpiresAt: null,
    });

    return {
      professorId: professor.id,
      message: 'Professor password updated successfully',
    };
  }

  async verifySetupToken(setupToken) {
    if (!setupToken || typeof setupToken !== 'string') {
      return {
        valid: false,
        message: 'Setup token is invalid, expired, or already used',
      };
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
      return {
        valid: false,
        message: 'Setup token is invalid, expired, or already used',
      };
    }

    const professor = await Professor.findOne({
      where: { userId: user.id },
    });

    if (!professor) {
      return {
        valid: false,
        message: 'Setup token is invalid, expired, or already used',
      };
    }

    return {
      valid: true,
      professorId: professor.id,
      message: 'Setup token verified',
    };
  }

  async registerProfessor(email, fullName, department) {
    const rawSetupToken = this.generateSecureToken();
    const passwordSetupTokenHash = this.hashToken(rawSetupToken);
    const passwordSetupTokenExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    const { user, professor } = await this.createProfessorUserAndRecord(
      email,
      fullName,
      department,
      {
        passwordSetupTokenHash,
        passwordSetupTokenExpiresAt,
      },
    );

    return {
      userId: user.id,
      professorId: professor.id,
      setupRequired: true,
      setupTokenGenerated: true,
      setupToken: rawSetupToken,
      passwordSetupTokenExpiresAt,
      message: 'Password setup link has been generated',
    };
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

  async setInitialPasswordByEmail(email, newPassword) {
    if (!email || typeof email !== 'string') {
      throw new Error('INVALID_PROFESSOR_EMAIL');
    }

    if (!this.isValidPassword(newPassword)) {
      throw new Error('INVALID_PASSWORD_POLICY');
    }

    const normalizedEmail = this.normalizeEmail(email);
    const user = await User.findOne({
      where: {
        email: normalizedEmail,
        role: 'PROFESSOR',
        status: 'PASSWORD_SETUP_REQUIRED',
      },
    });

    if (!user) {
      throw new Error('PROFESSOR_SETUP_NOT_FOUND');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await user.update({
      password: hashedPassword,
      passwordHash: hashedPassword,
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
