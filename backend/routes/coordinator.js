const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
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

router.post('/login', coordinatorLogin);
router.post(
  '/student-id-registry/import',
  authenticate,
  authorize(['COORDINATOR']),
  importValidStudentIds,
);
router.post('/rubrics', authenticate, authorize(['COORDINATOR']), createRubric);

router.get('/advisors', authenticate, authorize(['COORDINATOR']), listCoordinatorAdvisors);
router.get('/groups', authenticate, authorize(['COORDINATOR']), groupController.listGroups);
router.patch('/groups/:groupId/advisor-transfer', authenticate, authorize(['COORDINATOR']), transferByCoordinator);
router.patch('/groups/:groupId/members', authenticate, authorize(['COORDINATOR']), updateGroupMembership);
router.patch('/groups/:groupId/membership/coordinator', authenticate, authorize(['COORDINATOR']), updateGroupMembership);

router.put(
  '/weights',
  authenticate,
  authorize(['COORDINATOR']),
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
  coordinatorRubricController.upsertRubricValidation,
  coordinatorRubricController.upsertRubric,
);

module.exports = router;
