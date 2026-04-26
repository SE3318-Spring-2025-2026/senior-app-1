const {
  submitDeliverableValidation,
  submitDeliverable,
} = require('../controllers/groupDeliverableController');

// Add alongside other group routes:
router.post(
  '/:groupId/deliverables',
  authenticate,
  authorize(['STUDENT', 'PROFESSOR', 'COORDINATOR']),
  submitDeliverableValidation,
  submitDeliverable,
);