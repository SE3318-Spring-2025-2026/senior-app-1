const mongoose = require('mongoose');

const professorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
});

module.exports = mongoose.model('Professor', professorSchema);