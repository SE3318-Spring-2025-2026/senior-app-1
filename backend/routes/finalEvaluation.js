'use strict';

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  groupIdValidation,
  postTeamScalar,
  getTeamScalarHandler,
} = require('../controllers/finalEvaluationController');

const router = express.Router();

router.post(
  '/groups/:groupId/team-scalar',
  authenticate,
  authorize(['COORDINATOR']),
  groupIdValidation,
  postTeamScalar,
);

router.get(
  '/groups/:groupId/team-scalar',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR']),
  groupIdValidation,
  getTeamScalarHandler,
);

module.exports = router;
