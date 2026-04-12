const express = require('express');
const router = express.Router();
const { respondToInvitation } = require('../controllers/invitationController');
const authenticate = require('../middleware/authenticate'); // ← ADD (dosya adını kontrol et)

// PATCH /api/invitations/:id/response
router.patch('/:id/response', authenticate, respondToInvitation); // ← authenticate eklendi

module.exports = router;