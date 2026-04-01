const mongoose = require('mongoose');
const User = require('../models/User');
const Professor = require('../models/Professor');
const crypto = require('crypto');

class ProfessorService {
  async registerProfessor(email, fullName, department) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check if user exists
      const existingUser = await User.findOne({ email }).session(session);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Generate token and hash
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Create user
      const user = new User({
        email,
        fullName,
        role: 'PROFESSOR',
        status: 'PASSWORD_SETUP_REQUIRED',
        passwordSetupTokenHash: tokenHash,
      });
      await user.save({ session });

      // Create professor profile
      const professor = new Professor({
        user: user._id,
        department,
      });
      await professor.save({ session });

      await session.commitTransaction();
      session.endSession();

      return { userId: user._id, professorId: professor._id };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

module.exports = new ProfessorService();