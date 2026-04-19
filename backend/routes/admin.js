const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { adminLogin, registerProfessor, registerCoordinator } = require('../controllers/adminController.js');
const { listAuditLogs } = require('../controllers/auditLogController');

router.post('/login', adminLogin);
router.post('/professors', authenticate, authorize(['ADMIN']), registerProfessor);
router.post('/coordinators', authenticate, authorize(['ADMIN']), registerCoordinator);
router.get('/audit-logs', authenticate, authorize(['ADMIN']), listAuditLogs);

module.exports = router;
