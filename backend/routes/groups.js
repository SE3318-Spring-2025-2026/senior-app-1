const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  handleCreateGroup,
  handleDispatchInvites,
} = require('../controllers/groupFormationController');

const router = express.Router();

router.post('/', authenticate, authorize(['STUDENT']), handleCreateGroup);
router.post('/:groupId/invitations', authenticate, handleDispatchInvites);

module.exports = router;
