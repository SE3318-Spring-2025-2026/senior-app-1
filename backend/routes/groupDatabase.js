const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { transferInGroupDatabase } = require('../controllers/mentorMatchingController');

const router = express.Router();

router.patch(
  '/groups/:groupId/advisor-transfer',
  authenticate,
  authorize(['COORDINATOR']),
  transferInGroupDatabase,
);

module.exports = router;
