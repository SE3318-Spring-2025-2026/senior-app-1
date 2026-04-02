const crypto = require('crypto');
const sequelize = require('../db');
const User = require('../models/User');
const Professor = require('../models/Professor');

class ProfessorService {

  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex'); // 64 char
  }

  hashToken(token) {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
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
      await Professor.create({
        userId: user.id,
        department,
      }, { transaction });

      // 7. Commit
      await transaction.commit();

      // ISSUE'NUN İSTEDİĞİ RESPONSE
      return {
        setupTokenGenerated: true,
        message: 'Password setup link has been generated'
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new ProfessorService();