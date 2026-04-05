const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { importValidStudentIds } = require('../controllers/userDatabaseController');

const router = express.Router();

router.post(
  '/student-id-registry/import',
  authenticate,
  authorize(['COORDINATOR']),
  importValidStudentIds,
);

module.exports = router;
