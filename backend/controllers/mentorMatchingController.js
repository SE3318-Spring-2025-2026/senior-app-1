const { body, param, validationResult } = require('express-validator');
const mentorMatchingService = require('../services/mentorMatchingService');

const transferInGroupDatabase = [
  param('groupId').isString().trim().notEmpty(),
  body('newAdvisorId').isInt({ min: 1 }).toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_TRANSFER_INPUT',
        message: 'groupId and newAdvisorId are required.',
      });
    }

    try {
      const assignment = await mentorMatchingService.transferAdvisorInGroupDatabase({
        groupId: req.params.groupId,
        newAdvisorId: req.body.newAdvisorId,
      });

      return res.status(200).json(assignment);
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        code: 'GROUP_TRANSFER_FAILED',
        message: 'Advisor transfer could not be applied in Group DB.',
      });
    }
  },
];

module.exports = {
  transferInGroupDatabase,
};
