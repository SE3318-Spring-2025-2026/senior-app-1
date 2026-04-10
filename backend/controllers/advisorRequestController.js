const { body, validationResult } = require('express-validator');
const Group = require('../models/Group');
const AdvisorRequest = require('../models/AdvisorRequest');
const Professor = require('../models/Professor');
const User = require('../models/User');

const createAdvisorRequest = [
  body('groupId')
    .trim()
    .notEmpty()
    .withMessage('Group ID is required')
    .isInt({ min: 1 })
    .withMessage('Group ID must be a positive integer')
    .toInt(),
  body('professorId')
    .trim()
    .notEmpty()
    .withMessage('Professor is required')
    .isInt({ min: 1 })
    .withMessage('Professor selection must be a positive integer')
    .toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Format validation errors for clear field-level feedback
      const fieldErrors = {};
      errors.array().forEach((error) => {
        if (!fieldErrors[error.param]) {
          fieldErrors[error.param] = [];
        }
        fieldErrors[error.param].push(error.msg);
      });

      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Please check your input and try again',
        errors: fieldErrors,
      });
    }

    const { groupId, professorId } = req.body;

    try {
      // Validate group exists
      const group = await Group.findByPk(groupId);
      if (!group) {
        return res.status(400).json({
          code: 'GROUP_NOT_FOUND',
          message: 'Please check your input and try again',
          errors: {
            groupId: ['The specified group does not exist'],
          },
        });
      }

      // Validate professor exists
      const professor = await Professor.findByPk(professorId, {
        include: [{ model: User, attributes: ['id', 'fullName', 'email'] }],
      });
      if (!professor) {
        return res.status(400).json({
          code: 'PROFESSOR_NOT_FOUND',
          message: 'Please check your input and try again',
          errors: {
            professorId: ['The selected professor does not exist'],
          },
        });
      }

      // Check if request already exists with pending status
      const existingRequest = await AdvisorRequest.findOne({
        where: {
          groupId,
          professorId,
          status: ['PENDING', 'APPROVED'],
        },
      });

      if (existingRequest) {
        return res.status(409).json({
          code: 'REQUEST_ALREADY_EXISTS',
          message: 'An advisor request already exists for this group and professor',
          errors: {
            groupId: ['An advisor request already exists for this group and professor'],
          },
        });
      }

      // Create the request
      const advisorRequest = await AdvisorRequest.create({
        groupId,
        professorId,
        status: 'PENDING',
      });

      res.status(201).json({
        id: advisorRequest.id,
        groupId: advisorRequest.groupId,
        professorId: advisorRequest.professorId,
        status: advisorRequest.status,
        createdAt: advisorRequest.createdAt,
        message: 'Advisor request created successfully',
      });
    } catch (error) {
      console.error('Error creating advisor request:', error);
      res.status(500).json({
        code: 'SERVER_ERROR',
        message: 'Failed to create advisor request',
      });
    }
  },
];

const getAdvisorRequests = async (req, res) => {
  try {
    const { groupId, professorId, status } = req.query;

    const where = {};
    if (groupId) where.groupId = groupId;
    if (professorId) where.professorId = professorId;
    if (status) where.status = status;

    const requests = await AdvisorRequest.findAll({
      where,
      include: [
        {
          model: Group,
          attributes: ['id', 'name'],
          include: [
            {
              model: User,
              as: 'teamLeader',
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
        {
          model: Professor,
          attributes: ['id', 'department'],
          include: [
            {
              model: User,
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
      ],
    });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching advisor requests:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Failed to fetch advisor requests',
    });
  }
};

const getAdvisorRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the advisor request with all related data
    const advisorRequest = await AdvisorRequest.findByPk(id, {
      include: [
        {
          model: Group,
          attributes: ['id', 'name', 'teamLeaderId'],
          include: [
            {
              model: User,
              as: 'teamLeader',
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
        {
          model: Professor,
          attributes: ['id', 'department'],
          include: [
            {
              model: User,
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
      ],
    });

    // Check if request exists
    if (!advisorRequest) {
      return res.status(404).json({
        code: 'REQUEST_NOT_FOUND',
        message: 'Advisor request not found',
      });
    }

    // Authorization: Only the team leader (group owner) can view
    if (advisorRequest.Group.teamLeaderId !== userId) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view this advisor request',
      });
    }

    // Return the advisor request details
    res.json({
      id: advisorRequest.id,
      groupId: advisorRequest.groupId,
      professorId: advisorRequest.professorId,
      status: advisorRequest.status,
      createdAt: advisorRequest.createdAt,
      updatedAt: advisorRequest.updatedAt,
      group: {
        id: advisorRequest.Group.id,
        name: advisorRequest.Group.name,
        teamLeader: advisorRequest.Group.teamLeader,
      },
      professor: {
        id: advisorRequest.Professor.id,
        department: advisorRequest.Professor.department,
        user: advisorRequest.Professor.User,
      },
    });
  } catch (error) {
    console.error('Error fetching advisor request details:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Failed to fetch advisor request details',
    });
  }
};

const updateAdvisorRequestStatus = [
  body('status').isIn(['APPROVED', 'REJECTED', 'WITHDRAWN']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_STATUS',
        message: 'Status must be APPROVED, REJECTED, or WITHDRAWN',
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    try {
      const advisorRequest = await AdvisorRequest.findByPk(id);
      if (!advisorRequest) {
        return res.status(404).json({
          code: 'REQUEST_NOT_FOUND',
          message: 'Advisor request not found',
        });
      }

      advisorRequest.status = status;
      await advisorRequest.save();

      res.json({
        id: advisorRequest.id,
        groupId: advisorRequest.groupId,
        professorId: advisorRequest.professorId,
        status: advisorRequest.status,
        updatedAt: advisorRequest.updatedAt,
        message: `Advisor request ${status.toLowerCase()} successfully`,
      });
    } catch (error) {
      console.error('Error updating advisor request:', error);
      res.status(500).json({
        code: 'SERVER_ERROR',
        message: 'Failed to update advisor request',
      });
    }
  },
];

module.exports = {
  createAdvisorRequest,
  getAdvisorRequests,
  getAdvisorRequestById,
  updateAdvisorRequestStatus,
};
const { body, validationResult } = require('express-validator');
const Group = require('../models/Group');
const AdvisorRequest = require('../models/AdvisorRequest');
const Professor = require('../models/Professor');
const User = require('../models/User');

const createAdvisorRequest = [
  body('groupId')
    .trim()
    .notEmpty()
    .withMessage('Group ID is required')
    .isInt({ min: 1 })
    .withMessage('Group ID must be a positive integer')
    .toInt(),
  body('professorId')
    .trim()
    .notEmpty()
    .withMessage('Professor is required')
    .isInt({ min: 1 })
    .withMessage('Professor selection must be a positive integer')
    .toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Format validation errors for clear field-level feedback
      const fieldErrors = {};
      errors.array().forEach((error) => {
        if (!fieldErrors[error.param]) {
          fieldErrors[error.param] = [];
        }
        fieldErrors[error.param].push(error.msg);
      });

      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Please check your input and try again',
        errors: fieldErrors,
      });
    }

    const { groupId, professorId } = req.body;

    try {
      // Validate group exists
      const group = await Group.findByPk(groupId);
      if (!group) {
        return res.status(400).json({
          code: 'GROUP_NOT_FOUND',
          message: 'Please check your input and try again',
          errors: {
            groupId: ['The specified group does not exist'],
          },
        });
      }

      // Validate professor exists
      const professor = await Professor.findByPk(professorId, {
        include: [{ model: User, attributes: ['id', 'fullName', 'email'] }],
      });
      if (!professor) {
        return res.status(400).json({
          code: 'PROFESSOR_NOT_FOUND',
          message: 'Please check your input and try again',
          errors: {
            professorId: ['The selected professor does not exist'],
          },
        });
      }

      // Check if request already exists with pending status
      const existingRequest = await AdvisorRequest.findOne({
        where: {
          groupId,
          professorId,
          status: ['PENDING', 'APPROVED'],
        },
      });

      if (existingRequest) {
        return res.status(409).json({
          code: 'REQUEST_ALREADY_EXISTS',
          message: 'An advisor request already exists for this group and professor',
          errors: {
            groupId: ['An advisor request already exists for this group and professor'],
          },
        });
      }

      // Create the request
      const advisorRequest = await AdvisorRequest.create({
        groupId,
        professorId,
        status: 'PENDING',
      });

      res.status(201).json({
        id: advisorRequest.id,
        groupId: advisorRequest.groupId,
        professorId: advisorRequest.professorId,
        status: advisorRequest.status,
        createdAt: advisorRequest.createdAt,
        message: 'Advisor request created successfully',
      });
    } catch (error) {
      console.error('Error creating advisor request:', error);
      res.status(500).json({
        code: 'SERVER_ERROR',
        message: 'Failed to create advisor request',
      });
    }
  },
];

const getAdvisorRequests = async (req, res) => {
  try {
    const { groupId, professorId, status } = req.query;

    const where = {};
    if (groupId) where.groupId = groupId;
    if (professorId) where.professorId = professorId;
    if (status) where.status = status;

    const requests = await AdvisorRequest.findAll({
      where,
      include: [
        {
          model: Group,
          attributes: ['id', 'name'],
          include: [
            {
              model: User,
              as: 'teamLeader',
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
        {
          model: Professor,
          attributes: ['id', 'department'],
          include: [
            {
              model: User,
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
      ],
    });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching advisor requests:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Failed to fetch advisor requests',
    });
  }
};

const getAdvisorRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the advisor request with all related data
    const advisorRequest = await AdvisorRequest.findByPk(id, {
      include: [
        {
          model: Group,
          attributes: ['id', 'name', 'teamLeaderId'],
          include: [
            {
              model: User,
              as: 'teamLeader',
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
        {
          model: Professor,
          attributes: ['id', 'department'],
          include: [
            {
              model: User,
              attributes: ['id', 'fullName', 'email'],
            },
          ],
        },
      ],
    });

    // Check if request exists
    if (!advisorRequest) {
      return res.status(404).json({
        code: 'REQUEST_NOT_FOUND',
        message: 'Advisor request not found',
      });
    }

    // Authorization: Only the team leader (group owner) can view
    if (advisorRequest.Group.teamLeaderId !== userId) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view this advisor request',
      });
    }

    // Return the advisor request details
    res.json({
      id: advisorRequest.id,
      groupId: advisorRequest.groupId,
      professorId: advisorRequest.professorId,
      status: advisorRequest.status,
      createdAt: advisorRequest.createdAt,
      updatedAt: advisorRequest.updatedAt,
      group: {
        id: advisorRequest.Group.id,
        name: advisorRequest.Group.name,
        teamLeader: advisorRequest.Group.teamLeader,
      },
      professor: {
        id: advisorRequest.Professor.id,
        department: advisorRequest.Professor.department,
        user: advisorRequest.Professor.User,
      },
    });
  } catch (error) {
    console.error('Error fetching advisor request details:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Failed to fetch advisor request details',
    });
  }
};

const updateAdvisorRequestStatus = [
  body('status').isIn(['APPROVED', 'REJECTED', 'WITHDRAWN']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_STATUS',
        message: 'Status must be APPROVED, REJECTED, or WITHDRAWN',
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    try {
      const advisorRequest = await AdvisorRequest.findByPk(id);
      if (!advisorRequest) {
        return res.status(404).json({
          code: 'REQUEST_NOT_FOUND',
          message: 'Advisor request not found',
        });
      }

      advisorRequest.status = status;
      await advisorRequest.save();

      res.json({
        id: advisorRequest.id,
        groupId: advisorRequest.groupId,
        professorId: advisorRequest.professorId,
        status: advisorRequest.status,
        updatedAt: advisorRequest.updatedAt,
        message: `Advisor request ${status.toLowerCase()} successfully`,
      });
    } catch (error) {
      console.error('Error updating advisor request:', error);
      res.status(500).json({
        code: 'SERVER_ERROR',
        message: 'Failed to update advisor request',
      });
    }
  },
];

module.exports = {
  createAdvisorRequest,
  getAdvisorRequests,
  getAdvisorRequestById,
  updateAdvisorRequestStatus,
};
