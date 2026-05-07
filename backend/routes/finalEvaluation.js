'use strict';

const express = require('express');
const { submitAdvisorGradeValidation, postAdvisorGrade } = require('../controllers/finalEvaluationController');

const router = express.Router();
router.post('/advisor/:groupId', submitAdvisorGradeValidation, postAdvisorGrade);

module.exports = router;
