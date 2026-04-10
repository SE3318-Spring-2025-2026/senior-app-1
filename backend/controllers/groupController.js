const groupsRepository = require('../repositories/groupsRepository');

async function patchCoordinatorMembership(req, res) {
  const { groupId } = req.params;
  if (!groupId || String(groupId).trim() === '') {
    return res.status(404).json({
      message: 'Group not found',
      code: groupsRepository.CODES.GROUP_NOT_FOUND,
    });
  }

  const { action, studentId } = req.body || {};
  if (action !== 'ADD' && action !== 'REMOVE') {
    return res.status(400).json({
      message: 'Invalid action',
      code: groupsRepository.CODES.INVALID_ACTION,
    });
  }

  if (typeof studentId !== 'string' || !/^[0-9]{11}$/.test(studentId.trim())) {
    return res.status(400).json({
      message: 'Invalid studentId',
      code: 'INVALID_PAYLOAD',
    });
  }

  try {
    const group = await groupsRepository.applyCoordinatorChange(
      groupId,
      action,
      studentId.trim(),
    );
    return res.status(200).json(group);
  } catch (err) {
    if (!err.code) {
      throw err;
    }
    switch (err.code) {
      case groupsRepository.CODES.GROUP_NOT_FOUND:
        return res.status(404).json({ message: err.message, code: err.code });
      case groupsRepository.CODES.STUDENT_NOT_FOUND:
        return res.status(400).json({ message: err.message, code: err.code });
      case groupsRepository.CODES.INVALID_ACTION:
        return res.status(400).json({ message: err.message, code: err.code });
      case groupsRepository.CODES.LEADER_REMOVAL_REQUIRES_REASSIGNMENT:
        return res.status(409).json({ message: err.message, code: err.code });
      default:
        throw err;
    }
  }
}

module.exports = { patchCoordinatorMembership };
