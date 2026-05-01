const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/finalEvaluationController');

const router = express.Router();

router.post(
  '/groups/:groupId/finalize',
  authenticate,
  authorize(['COORDINATOR']),
  ctrl.finalizeValidation,
  ctrl.finalize,
);

router.get(
  '/groups/:groupId/final-grades',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR']),
  ctrl.getGradesValidation,
  ctrl.getGrades,
);

module.exports = router;
