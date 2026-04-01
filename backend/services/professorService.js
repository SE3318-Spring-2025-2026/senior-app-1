const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Professor = require('../models/Professor');

class ProfessorService {
  async registerProfessor(email, fullName, department) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const existingUser = await User.findOne({ email }).session(session);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const rawSetupToken = crypto.randomBytes(32).toString('hex');
      const passwordSetupTokenHash = crypto
        .createHash('sha256')
        .update(rawSetupToken)
        .digest('hex');

      const passwordSetupTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const user = new User({
        email,
        fullName,
        role: 'PROFESSOR',
        status: 'PASSWORD_SETUP_REQUIRED',
        passwordSetupTokenHash,
        passwordSetupTokenExpiresAt,
      });

      await user.save({ session });

      const professor = new Professor({
        user: user._id,
        department,
      });

      await professor.save({ session });
      await session.commitTransaction();

      return {
        userId: user._id,
        professorId: professor._id,
      };
    } catch (error) {
      await session.abortTransaction();

      if (error.code === 11000 && error.keyPattern?.email) {
        const duplicateError = new Error('User with this email already exists');
        duplicateError.code = 11000;
        duplicateError.keyPattern = { email: 1 };
        throw duplicateError;
      }

      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new ProfessorService();