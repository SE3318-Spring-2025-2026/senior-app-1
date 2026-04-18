const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getStudentValidation,
  handleGitHubCallback,
  loginStudent,
  registerStudent,
  registerStudentValidation,
  startGitHubLink,
  storeLinkedGitHubAccount,
  updateStudentGitHubLink,
} = require('../controllers/studentController');

const router = express.Router();

router.post('/students/login', loginStudent);
router.post('/students/registration-validation', registerStudentValidation);
router.post('/students/register', registerStudent);
router.get('/user-database/students/:studentId/validation', getStudentValidation);
router.patch('/user-database/students/:studentId/github-link', updateStudentGitHubLink);
router.get('/students/me/github/link', authenticate, startGitHubLink);
router.get('/auth/github/callback', handleGitHubCallback);
router.post('/linked-github-account-store/links', storeLinkedGitHubAccount);

module.exports = router;
