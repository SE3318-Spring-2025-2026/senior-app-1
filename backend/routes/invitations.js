const express = require('express');
const { authenticate } = require('../middleware/auth');
const { respondToInvitation } = require('../controllers/groupFormationController');

const router = express.Router();

// Keep both spellings for compatibility with existing docs while backend converges.
router.patch('/invitations/:invitationId/respond', authenticate, respondToInvitation);
router.patch('/invitations/:invitationId/response', authenticate, respondToInvitation);

module.exports = router;

