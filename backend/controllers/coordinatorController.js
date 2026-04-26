const { body, param, validationResult } = require('express-validator');
const coordinatorGroupService = require('../services/coordinatorGroupService');

const updateGroupMembership = [
  param('groupId').isString().trim().notEmpty(),
  body('action').isString().trim().custom((value) => ['ADD', 'REMOVE'].includes(String(value).toUpperCase())),
  body('studentId').isString().trim().matches(/^[0-9]{11}$/),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_MEMBERSHIP_EDIT_INPUT',
        message: 'groupId, action (ADD/REMOVE), and studentId are required.',
      });
    }

    try {
      const group = await coordinatorGroupService.updateGroupMembershipByCoordinator({
        groupId: req.params.groupId,
        action: req.body.action,
        studentId: req.body.studentId.trim(),
        actor: req.user,
      });

      return res.status(200).json({
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
      return next(error);
    }
  },
];

const createRubric = [
  body('deliverableName').isString().trim().notEmpty(),
  body('criteria').isArray({ min: 1 }),
  body('criteria.*.name').isString().trim().notEmpty(),
  body('criteria.*.description').optional().isString().trim(),
  body('criteria.*.maxPoints').isNumeric(),
  body('totalPoints').isNumeric(),
  body('courseId').optional().isInt(),

  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_RUBRIC_INPUT',
        message: 'Rubric payload failed validation.',
        errors: errors.array(),
      });
    }

    try {
      const { deliverableName, criteria, totalPoints, courseId } = req.body;

      const rubric = await req.app.locals.models.DeliverableRubric.create({
        deliverableName,
        criteria,
        totalPoints,
        courseId: courseId ?? null,
      });

      return res.status(201).json(rubric);
    } catch (error) {
      if (error.status && error.code) {
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
      }
      return next(error);
    }
  },
];

module.exports = {
  updateGroupMembership,
  createRubric,
};