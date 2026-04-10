const { body, validationResult } = require('express-validator');
const groupService = require('../services/groupService');

const handleCreateGroup = [
  body('name').isString().trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_GROUP_NAME',
        message: 'Group name is required.',
      });
    }

    try {
      const group = await groupService.createShell(req.body.name, req.user.id);

      return res.status(201).json({
        id: group.id,
        name: group.name,
        leaderId: group.leaderId,
        memberIds: group.memberIds,
      });
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      console.error('Group creation failed unexpectedly:', error);
      return res.status(500).json({
        code: 'GROUP_CREATION_FAILED',
        message: 'Group could not be created.',
      });
    }
  },
];

module.exports = {
  handleCreateGroup,
};

