const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { adminLogin, registerProfessor, registerCoordinator } = require('../controllers/adminController.js');

router.post('/login', adminLogin);
router.post('/professors', authenticate, authorize(['ADMIN']), registerProfessor);
router.post('/coordinators', authenticate, authorize(['ADMIN']), registerCoordinator);

module.exports = router;
