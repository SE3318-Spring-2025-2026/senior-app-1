const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { handleCreateGroup } = require('../controllers/groupFormationController');

const router = express.Router();

router.post('/groups', authenticate, authorize(['STUDENT']), handleCreateGroup);

module.exports = router;

