const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const { adminLogin, registerProfessor, registerCoordinator } = require('../controllers/adminController.js');
const { listAuditLogs } = require('../controllers/auditLogController');

router.post('/login', requireNonEmptyBody, adminLogin);
router.post('/professors', authenticate, authorize(['ADMIN']), requireNonEmptyBody, registerProfessor);
router.post('/coordinators', authenticate, authorize(['ADMIN']), requireNonEmptyBody, registerCoordinator);
router.get('/audit-logs', authenticate, authorize(['ADMIN']), listAuditLogs);

module.exports = router;
