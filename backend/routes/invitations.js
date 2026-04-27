const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const { respondToInvitation, getMyInvitations } = require('../controllers/invitationController');

const router = express.Router();

router.get('/invitations/me', authenticate, getMyInvitations);

// Keep both spellings for compatibility with existing docs while backend converges.
router.patch('/invitations/:invitationId/respond', authenticate, requireNonEmptyBody, respondToInvitation);
router.patch('/invitations/:invitationId/response', authenticate, requireNonEmptyBody, respondToInvitation);

module.exports = router;
