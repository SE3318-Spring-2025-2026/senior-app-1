const mongoose = require('mongoose');

const professorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: String, required: true },
  // Add other fields as needed
});

module.exports = mongoose.model('Professor', professorSchema);