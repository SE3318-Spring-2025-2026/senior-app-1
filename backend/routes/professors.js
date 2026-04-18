const express = require('express');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { setupProfessorPassword } = require('../controllers/professorController');
const { User } = require('../models');

const router = express.Router();

router.post('/password-setup', setupProfessorPassword);

/**
 * GET /api/v1/professors/list
 * Get list of all active professors
 */
router.get('/list', authenticate, async (req, res) => {
  try {
    const professors = await User.findAll({
      where: {
        role: 'PROFESSOR',
        status: 'ACTIVE',
      },
      attributes: ['id', 'fullName', 'email'],
      order: [['fullName', 'ASC']],
    });

    return res.status(200).json(professors);
  } catch (error) {
    console.error('Error fetching professors:', error);
    return res.status(500).json({
      code: 'FETCH_PROFESSORS_FAILED',
      message: 'Failed to fetch professors',
    });
  }
});

module.exports = router;
