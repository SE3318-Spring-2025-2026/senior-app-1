const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  handleCreateGroup,
  handleDispatchInvites,
} = require('../controllers/groupFormationController');
const {
  finalizeMembershipValidation,
  getGroupMembershipValidation,
  createGroupValidation: finalizeMembershipCreateGroupValidation,
} = require('../controllers/groupController');

const router = express.Router();

// Group Formation routes (Issue 59, 62, 64)
router.post('/', authenticate, authorize(['STUDENT']), handleCreateGroup);
router.post('/:groupId/invitations', authenticate, handleDispatchInvites);

// Group Membership routes (Issue 84)
/**
 * GET /api/v1/groups/:groupId/membership
 * Retrieve group membership details
 */
router.get('/:groupId/membership', authenticate, getGroupMembershipValidation);

/**
 * POST /api/v1/groups/:groupId/membership/finalize
 * Finalize membership after acceptance (Data Flow: f11)
 * Atomically updates D2, enforces constraints, prevents lost updates
 */
router.post('/:groupId/membership/finalize', authenticate, finalizeMembershipValidation);

module.exports = router;
