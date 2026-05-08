const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  advisorGradeValidation,
  submitAdvisorGrade,
  updateAdvisorGrade,
  getAdvisorGrades,
  committeeGradeValidation,
  submitCommitteeGrade,
  updateCommitteeGrade,
} = require('../controllers/finalEvaluationController');

const router = express.Router();

// Committee member submits grade (POST)
router.post('/groups/:groupId/committee-grade', authenticate, committeeGradeValidation, submitCommitteeGrade);
// Committee member updates grade (PUT)
router.put('/groups/:groupId/committee-grade', authenticate, committeeGradeValidation, updateCommitteeGrade);

// Advisor submits grade (POST)
router.post('/groups/:groupId/advisor-grade', authenticate, advisorGradeValidation, submitAdvisorGrade);
// Advisor updates grade (PUT)
router.put('/groups/:groupId/advisor-grade', authenticate, advisorGradeValidation, updateAdvisorGrade);
// Coordinator/Professor gets all grades (GET)
router.get('/groups/:groupId/grades', authenticate, getAdvisorGrades);

module.exports = router;

router.get(
  '/groups/:groupId/contributions',
  authenticate,
  authorize(['COORDINATOR', 'PROFESSOR', 'ADMIN']),
  groupIdValidation,
  getContributionsHandler,
);

module.exports = router;
