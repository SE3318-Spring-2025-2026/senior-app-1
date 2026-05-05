const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/finalEvaluationController');

const router = express.Router();

router.get(
  '/my-grade',
  authenticate,
  authorize(['STUDENT']),
  ctrl.myGrade,
);

module.exports = router;
