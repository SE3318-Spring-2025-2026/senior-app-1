const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { patchCoordinatorMembership } = require('../controllers/groupController');

const router = express.Router();

router.patch(
  '/:groupId/membership/coordinator',
  authenticate,
  authorize(['COORDINATOR']),
  patchCoordinatorMembership,
);

module.exports = router;
