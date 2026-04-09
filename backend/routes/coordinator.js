const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { updateGroupMembership } = require('../controllers/coordinatorController');

const router = express.Router();

router.patch('/groups/:groupId/members', authenticate, authorize(['COORDINATOR']), updateGroupMembership);

module.exports = router;

