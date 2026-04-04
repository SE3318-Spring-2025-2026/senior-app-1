const { storeValidStudentIds } = require('./userDatabaseController');

// POST /api/v1/coordinator/student-id-registry/import
// Only COORDINATOR role allowed (enforced in route)
const importValidStudentIds = async (req, res) => {
  // Forward to the same logic as storeValidStudentIds
  return storeValidStudentIds(req, res);
};

module.exports = {
  importValidStudentIds,
};
