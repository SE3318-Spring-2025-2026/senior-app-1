const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getCurrentStudent,
  getStudentValidation,
  handleGitHubCallback,
  loginStudent,
  registerStudent,
  registerStudentValidation,
  startGitHubLink,
  storeLinkedGitHubAccount,
  updateStudentGitHubLink,
} = require('../controllers/studentController');
const { Group } = require('../models');

const router = express.Router();

router.post('/students/login', loginStudent);
router.post('/students/registration-validation', registerStudentValidation);
router.post('/students/register', registerStudent);
router.get('/students/me', authenticate, getCurrentStudent);
router.get('/user-database/students/:studentId/validation', getStudentValidation);
router.patch('/user-database/students/:studentId/github-link', updateStudentGitHubLink);
router.get('/students/me/github/link', authenticate, startGitHubLink);
router.get('/auth/github/callback', handleGitHubCallback);
router.post('/linked-github-account-store/links', storeLinkedGitHubAccount);

/**
 * GET /api/v1/groups/my-groups
 * Get groups where the authenticated user is the team leader
 */
router.get('/groups/my-groups', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await Group.findAll({
      where: {
        leaderId: userId,
      },
      attributes: ['id', 'name', 'leaderId', 'memberIds', 'advisorId', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json(groups);
  } catch (error) {
    console.error('Error fetching user groups:', error);
    return res.status(500).json({
      code: 'FETCH_GROUPS_FAILED',
      message: 'Failed to fetch groups',
    });
  }
});

module.exports = router;
