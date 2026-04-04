const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { verifySetupToken } = require('../controllers/passwordSetupTokenController');

const router = express.Router();

router.post('/verify', authenticate, authorize(['ADMIN']), verifySetupToken);

module.exports = router;
