const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const SprintEvaluationSchema = new mongoose.Schema({
  evaluationId: {
    type: String,
    default: uuidv4,
    unique: true
  },
  teamId: {
    type: String,
    required: true,
    index: true
  },
  sprintId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    required: true
  },
  aggregatedScore: {
    type: Number,
    default: null
  },
  completionRate: {
    type: Number,
    default: null
  },
  gradingSummary: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

SprintEvaluationSchema.index({ teamId: 1, sprintId: 1 }, { unique: true });

module.exports = mongoose.model('SprintEvaluation', SprintEvaluationSchema);