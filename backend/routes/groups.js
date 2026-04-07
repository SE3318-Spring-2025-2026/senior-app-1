const express = require('express');
const { authenticate } = require('../middleware/auth');
const { handleDispatchInvites } = require('../controllers/groupFormationController');

const router = express.Router();

router.post('/:groupId/invitations', authenticate, handleDispatchInvites);

module.exports = router;
