const express = require('express');
const { authenticate } = require('../middleware/auth');
const { handleCreateGroup } = require('../controllers/groupFormationController');

const router = express.Router();

router.post('/groups', authenticate, handleCreateGroup);

module.exports = router;

