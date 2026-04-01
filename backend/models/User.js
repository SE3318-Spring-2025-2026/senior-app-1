const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['STUDENT', 'PROFESSOR', 'COORDINATOR', 'ADMIN'],
    required: true,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PASSWORD_SETUP_REQUIRED'],
    default: 'ACTIVE',
  },
  passwordSetupTokenHash: {
    type: String,
  },
  passwordSetupTokenExpiresAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);