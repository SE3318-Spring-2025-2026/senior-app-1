'use strict';

const express = require('express');
const router = express.Router();
const { submitAdvisorGradeValidation, postAdvisorGrade } = require('../controllers/finalEvaluationController');

router.post('/advisor/:groupId', submitAdvisorGradeValidation, postAdvisorGrade);

module.exports = router;
