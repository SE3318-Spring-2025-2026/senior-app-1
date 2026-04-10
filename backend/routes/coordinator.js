const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { coordinatorLogin } = require('../controllers/adminController');
const { importValidStudentIds } = require('../controllers/userDatabaseController');

const router = express.Router();

router.post('/login', coordinatorLogin);
router.post(
  '/student-id-registry/import',
  authenticate,
  authorize(['COORDINATOR']),
  importValidStudentIds,
);

module.exports = router;
