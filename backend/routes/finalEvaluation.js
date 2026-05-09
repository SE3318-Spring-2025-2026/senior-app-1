'use strict';

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/finalEvaluationController');

const router = express.Router();

router.put(
  '/weight-configuration',
  authenticate,
  authorize(['COORDINATOR']),
  ctrl.weightConfigBodyValidation,
  ctrl.putWeightConfiguration,
);

router.get(
  '/weight-configuration',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR', 'ADVISOR']),
  ctrl.getWeightConfiguration,
);

router.post(
  '/groups/:groupId/advisor-grade',
  authenticate,
  authorize(['PROFESSOR']),
  ctrl.groupIdValidation,
  ctrl.gradeBodyValidation,
  ctrl.postAdvisorGrade,
);

router.put(
  '/groups/:groupId/advisor-grade',
  authenticate,
  authorize(['PROFESSOR']),
  ctrl.groupIdValidation,
  ctrl.gradeBodyValidation,
  ctrl.putAdvisorGrade,
);

router.post(
  '/groups/:groupId/committee-grade',
  authenticate,
  authorize(['PROFESSOR']),
  ctrl.groupIdValidation,
  ctrl.gradeBodyValidation,
  ctrl.postCommitteeGrade,
);

router.put(
  '/groups/:groupId/committee-grade',
  authenticate,
  authorize(['PROFESSOR']),
  ctrl.groupIdValidation,
  ctrl.gradeBodyValidation,
  ctrl.putCommitteeGrade,
);

router.get(
  '/groups/:groupId/grades',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR']),
  ctrl.groupIdValidation,
  ctrl.getRawGrades,
);

router.post(
  '/groups/:groupId/team-scalar',
  authenticate,
  authorize(['COORDINATOR']),
  ctrl.groupIdValidation,
  ctrl.postTeamScalar,
);

router.get(
  '/groups/:groupId/team-scalar',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR']),
  ctrl.groupIdValidation,
  ctrl.getTeamScalarHandler,
);

router.get(
  '/groups/:groupId/contributions',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR', 'ADMIN']),
  ctrl.groupIdValidation,
  ctrl.getContributionsHandler,
);

router.get(
  '/my-grade',
  authenticate,
  authorize(['STUDENT']),
  ctrl.myGrade,
);

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

router.get(
  '/groups/:groupId/deliverables',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR']),
  ctrl.groupIdValidation,
  ctrl.getGroupDeliverables,
);

module.exports = router;
