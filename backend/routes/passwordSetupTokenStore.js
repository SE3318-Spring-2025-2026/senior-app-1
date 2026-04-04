const express = require('express');
const { verifySetupToken } = require('../controllers/passwordSetupTokenController');

const router = express.Router();

router.post('/verify', verifySetupToken);

module.exports = router;
