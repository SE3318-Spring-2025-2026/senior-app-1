const { Group, MemberFinalGrade } = require('../models');
const ApiError = require('../errors/apiError');

/**
 * Retrieve the authenticated student's own final grade.
 *
 * Resolves the student's group by scanning Group.memberIds (SQLite does not
 * support JSON containment operators, so we load all groups and filter in JS).
 *
 * @param {object} user - req.user (Sequelize User row)
 * @returns {Promise<{ userId, groupId, finalScore, letterGrade, finalizedAt }>}
 * @throws {ApiError} 404 if group or grade not found
 */
async function getMyGrade(user) {
  const userId = String(user.id);

  const groups = await Group.findAll({ attributes: ['id', 'memberIds'] });
  const group = groups.find(
    (g) => Array.isArray(g.memberIds) && g.memberIds.map(String).includes(userId),
  );

  if (!group) {
    throw ApiError.notFound('GROUP_NOT_FOUND', 'No group found for this student');
  }

  const grade = await MemberFinalGrade.findOne({
    where: { userId: user.id, groupId: group.id },
  });

  if (!grade) {
    throw ApiError.notFound(
      'GRADE_NOT_FOUND',
      'Coordinator has not finalized grades for your group yet',
    );
  }

  return {
    userId: grade.userId,
    groupId: grade.groupId,
    finalScore: grade.finalScore,
    letterGrade: grade.letterGrade,
    finalizedAt: grade.updatedAt,
  };
}

module.exports = { getMyGrade };
