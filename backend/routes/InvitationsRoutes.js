const express = require('express');
const router = express.Router();
const { respondToInvitation } = require('../controllers/invitationController');

// PATCH /api/invitations/:id/response
router.patch('/:id/response', respondToInvitation);

module.exports = router;