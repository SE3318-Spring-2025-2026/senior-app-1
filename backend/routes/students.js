const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createStudentAccount,
  getStudentValidation,
  handleGitHubCallback,
  registerStudentValidation,
  startGitHubLink,
  storeLinkedGitHubAccount,
  updateStudentGitHubLink,
} = require('../controllers/studentController');

const router = express.Router();

router.post('/students/registration-validation', registerStudentValidation);
router.post('/user-database/students', createStudentAccount);
router.get('/user-database/students/:studentId/validation', getStudentValidation);
router.patch('/user-database/students/:studentId/github-link', updateStudentGitHubLink);
router.get('/students/me/github/link', authenticate, startGitHubLink);
router.get('/auth/github/callback', handleGitHubCallback);
router.post('/linked-github-account-store/links', storeLinkedGitHubAccount);

module.exports = router;
