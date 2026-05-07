'use strict';

// backend/routes/finalEvaluation.js  (new file)
// Mount in app.js / server.js with:
//   app.use('/api/v1/final-evaluation', require('./routes/finalEvaluation'));

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  putWeightConfiguration,
  getWeightConfiguration,
} = require('../controllers/finalEvaluationWeightController');

const router = express.Router();

// PUT  /api/v1/final-evaluation/weight-configuration
router.put(
  '/weight-configuration',
  authenticate,
  authorize(['COORDINATOR']),
  putWeightConfiguration
);

// GET  /api/v1/final-evaluation/weight-configuration
router.get(
  '/weight-configuration',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR', 'ADVISOR']),
  getWeightConfiguration
);

module.exports = router;