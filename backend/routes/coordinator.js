const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { importValidStudentIds } = require('../controllers/coordinatorController');

const router = express.Router();

// POST /api/v1/coordinator/student-id-registry/import
router.post('/student-id-registry/import', authenticate, authorize(['COORDINATOR']), importValidStudentIds);

module.exports = router;
