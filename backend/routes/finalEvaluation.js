'use strict';

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  groupIdValidation,
  postTeamScalar,
  getTeamScalarHandler,
  getContributionsHandler,
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

router.get(
  '/groups/:groupId/contributions',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR', 'ADMIN']),
  groupIdValidation,
  getContributionsHandler,
);

module.exports = router;
