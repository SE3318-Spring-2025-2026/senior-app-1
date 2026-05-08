const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { requireNonEmptyBody } = require('../middleware/requestValidation');
const { coordinatorLogin } = require('../controllers/adminController');
const { importValidStudentIds } = require('../controllers/userDatabaseController');
const { updateGroupMembership, createRubric } = require('../controllers/coordinatorController');
const {
  listCoordinatorAdvisors,
  transferByCoordinator,
} = require('../controllers/mentorMatchingController');
const groupController = require('../controllers/groupController');
const coordinatorWeightsController = require('../controllers/coordinatorWeightsController');
const coordinatorRubricController = require('../controllers/coordinatorRubricController');

const router = express.Router();

router.post('/login', requireNonEmptyBody, coordinatorLogin);
router.post(
  '/student-id-registry/import',
  authenticate,
  authorize(['COORDINATOR']),
  requireNonEmptyBody,
  importValidStudentIds,
);
router.post('/rubrics', authenticate, authorize(['COORDINATOR']), requireNonEmptyBody, createRubric);

router.get('/advisors', authenticate, authorize(['COORDINATOR']), listCoordinatorAdvisors);
router.get('/groups', authenticate, authorize(['COORDINATOR']), groupController.listGroups);
router.patch('/groups/:groupId/advisor-transfer', authenticate, authorize(['COORDINATOR']), requireNonEmptyBody, transferByCoordinator);
router.patch('/groups/:groupId/members', authenticate, authorize(['COORDINATOR']), requireNonEmptyBody, updateGroupMembership);
router.patch('/groups/:groupId/membership/coordinator', authenticate, authorize(['COORDINATOR']), requireNonEmptyBody, updateGroupMembership);

router.put(
  '/weights',
  authenticate,
  authorize(['COORDINATOR']),
  requireNonEmptyBody,
  coordinatorWeightsController.updateWeightsValidation,
  coordinatorWeightsController.updateWeights,
);

router.get(
  '/rubrics',
  authenticate,
  authorize(['COORDINATOR']),
  coordinatorRubricController.listRubrics,
);
router.get(
  '/rubrics/:deliverableType',
  authenticate,
  authorize(['COORDINATOR']),
  coordinatorRubricController.getRubricValidation,
  coordinatorRubricController.getRubric,
);
router.put(
  '/rubrics',
  authenticate,
  authorize(['COORDINATOR']),
  requireNonEmptyBody,
  coordinatorRubricController.upsertRubricValidation,
  coordinatorRubricController.upsertRubric,
);

module.exports = router;
